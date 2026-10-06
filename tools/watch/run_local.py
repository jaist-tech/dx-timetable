#!/usr/bin/env python3
"""共有サーバーの cron から呼ぶ．検知→ブランチ作成→解析→commit→メール通知（push はしない）

専用のクローン（既定 ~/project/tmp/dx-timetable-watch）を origin/main に合わせ，
dev ブランチ（無ければ origin/main から作る）で watch.py と apply.py を実行する．
変化（新規・更新・期限切れ・要手動）があり，前回のメールと内容が違うときだけ，
morning-paper の SMTP（Simple Mail Transfer Protocol）設定でメールを送る．

    uv run --with pdfplumber --with pandas python tools/watch/run_local.py [--no-mail] [--clone DIR]
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tomllib
import traceback
from datetime import datetime

REMOTE = "git@github.com:jaist-tech/dx-timetable.git"
MORNING = os.path.expanduser("~/project/morning-paper")


def sh(args, cwd, check=True, **kw):
    return subprocess.run(args, cwd=cwd, check=check, text=True, capture_output=True, **kw)


def send_mail(subject, body):
    import smtplib
    from email.message import EmailMessage
    from email.utils import formatdate
    with open(os.path.join(MORNING, "secrets.toml"), "rb") as f:
        n = tomllib.load(f)["notify"]
    msg = EmailMessage()
    msg["Subject"], msg["Date"] = subject, formatdate(localtime=True)
    msg["From"], msg["To"] = n.get("mail_from") or n["smtp_user"], n["mail_to"]
    msg.set_content(body)
    with smtplib.SMTP(n["smtp_host"], int(n.get("smtp_port", 587)), timeout=60) as s:
        s.starttls()
        s.login(n["smtp_user"], n["smtp_pass"])
        s.send_message(msg)


FAIL_STREAK_MAIL = 2  # 続けてこの回数失敗したらメールで知らせる


def record_run(d, ok, note):
    """実行の結果を <clone>/.git/run_history.json に残す．続けて失敗したら (件数, 初回か) を返す"""
    path = os.path.join(d, ".git", "run_history.json")
    try:
        with open(path, encoding="utf-8") as f:
            hist = json.load(f)
    except (OSError, ValueError):
        hist = {"runs": [], "alerted": False}
    hist["runs"] = (hist["runs"] + [{"at": datetime.now().isoformat(timespec="seconds"), "ok": ok, "note": note[:300]}])[-30:]
    streak = 0
    for r in reversed(hist["runs"]):
        if r["ok"]:
            break
        streak += 1
    first = streak >= FAIL_STREAK_MAIL and not hist.get("alerted")
    if streak < FAIL_STREAK_MAIL:
        hist["alerted"] = False  # 回復したら解除（次の失敗の連続でまた知らせる）
    with open(path, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=1)
    return streak, first, path


def mark_alerted(path):
    with open(path, encoding="utf-8") as f:
        hist = json.load(f)
    hist["alerted"] = True
    with open(path, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=1)


def main():
    args = parse_args()
    d = args.clone
    try:
        rc, ok, note = run(args)
    except Exception:  # noqa: BLE001
        rc, ok, note = 1, False, traceback.format_exc()
        print(note)
    if os.path.isdir(os.path.join(d, ".git")):
        streak, first, hpath = record_run(d, ok, note)
        if first and not args.no_mail:
            send_mail("[時刻表] 定期実行が続けて失敗しています",
                      f"run_local.py が {streak} 回続けて失敗しました（直近の理由）．\n\n{note}\n\n"
                      f"履歴: {d}/.git/run_history.json\nログ: ~/project/tmp/dx-timetable-watch.log")
            mark_alerted(hpath)  # 送れなかったとき（例外）は印を付けず，次回に再送する
    return rc


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clone", default=os.path.expanduser("~/project/tmp/dx-timetable-watch"))
    ap.add_argument("--remote", default=REMOTE)
    ap.add_argument("--base", default="origin/main", help="作業ブランチの起点（試験用）")
    ap.add_argument("--no-mail", action="store_true")
    return ap.parse_args()


def run(args):
    """戻り値: (終了コード, 正常に動いたか, 失敗の理由)"""
    d = args.clone
    if not os.path.isdir(os.path.join(d, ".git")):
        os.makedirs(os.path.dirname(d), exist_ok=True)
        sh(["git", "clone", "-q", args.remote, d], cwd=os.path.dirname(d))
    sh(["git", "fetch", "-q", "origin"], cwd=d)
    # 運用は dev → main の PR（過去の PR #1〜#6 はすべて dev→main）．dev が無ければ main から作る
    branch = "dev"
    if args.base == "origin/main" and sh(["git", "rev-parse", "-q", "--verify", "origin/dev"], cwd=d, check=False).returncode == 0:
        args.base = "origin/dev"
    sh(["git", "checkout", "-q", "-f", "-B", branch, args.base], cwd=d)
    sh(["git", "clean", "-qfd", "public/data"], cwd=d)

    w = sh([sys.executable, "tools/watch/watch.py", "--update-state"], cwd=d, check=False)
    a = sh([sys.executable, "tools/watch/apply.py"], cwd=d, check=False)
    # のみバス: 条件付き GET で更新のあったページだけ再取得（3 秒間隔・robots.txt 確認．キャッシュはクローンの cache/ に残る）
    n = sh([sys.executable, "run.py", "--refresh"], cwd=os.path.join(d, "tools", "nomibus"), check=False)
    nomi_report = f"## のみバス\n" + (n.stdout[-1500:] if n.returncode == 0 else f"要手動: 取得・読み取りに失敗（終了コード {n.returncode}）\n{(n.stdout + n.stderr)[-1500:]}")
    # 検査: 取得→読み取り→JSON の結果（変更・追加されたファイルと manifest）を検査し，落ちたら commit しない
    v = sh([sys.executable, "tools/watch/validate.py", "--changed"], cwd=d, check=False)
    gate = ""
    if v.returncode != 0:
        sh(["git", "checkout", "-q", "--", "public/data"], cwd=d, check=False)
        sh(["git", "clean", "-qfd", "public/data"], cwd=d, check=False)
        gate = f"## 検査に落ちたため反映していません（要手動）\n{v.stdout}"
    changed = sh(["git", "status", "--porcelain", "public/data"], cwd=d).stdout.strip()
    src_err = "## エラー" in w.stdout  # 公式ページの取得失敗
    nomi_bad = n.returncode != 0
    crashed = [x for x in (("watch.py", w), ("apply.py", a), ("validate.py", v)) if x[1].returncode not in (0, 10, 1) or (x[0] != "validate.py" and x[1].returncode == 1)]
    ok = not src_err and not nomi_bad and not crashed
    note = "".join(f"{n} が異常終了（終了コード {r.returncode}）: {r.stderr[-300:]}\n" for n, r in crashed) + ("公式ページの取得失敗: " + w.stdout.split("## エラー")[-1][:300] if src_err else "") + (nomi_report if nomi_bad else "")
    needs = w.returncode == 10 or a.returncode == 10 or bool(changed) or bool(gate) or nomi_bad or bool(crashed)
    print(w.stdout, a.stdout, nomi_report, gate, sep="\n")
    if not needs:
        return 0, ok, note
    if changed:
        sh(["git", "add", "public/data", "tools/watch/state.json"], cwd=d)
        sh(["git", "-c", "user.name=msato", "-c", "user.email=s2510070@jaist.ac.jp", "commit", "-q", "-m",
            "時刻表の改定を自動で反映（検知・解析．要確認）"], cwd=d)
        stat = sh(["git", "diff", "--stat", f"{args.base}..HEAD", "--", "public/data"], cwd=d).stdout
    else:
        stat = "（public/data の変更なし）"

    report = f"{w.stdout}\n{a.stdout}\n{nomi_report}\n{gate}"
    digest = hashlib.sha256(report.encode()).hexdigest()
    mark = os.path.join(d, ".git", "last_mailed")
    if os.path.exists(mark) and open(mark).read() == digest:
        print("前回のメールと同じ内容のため送らない")
        return 0, ok, note
    body = f"""時刻表ソースの更新または期限切れを検知しました．

## 反映の流れ（あなたの作業は 1〜3）
1. 差分を確認する: cd {d} && git show --stat HEAD && git diff origin/main -- public/data/manifest.json
2. 問題なければ push する: cd {d} && git push -u origin {branch}
3. GitHub で dev → main の PR（Pull Request）を作り，目視確認して merge する（main への push で deploy.yml が GitHub Pages に公開する）
「要手動」の行は自動で反映していません．tools/admin/ で PDF を追加してください．

## 変更ファイル
{stat}
## 検知レポート
{w.stdout}
## 解析レポート
{a.stdout}
{nomi_report}
{gate}"""
    if args.no_mail:
        print(body)
        return 0, ok, note
    send_mail(f"[時刻表] 更新を検知（{branch}）", body)
    with open(mark, "w") as f:
        f.write(digest)
    print("メールを送信した")
    return 0, ok, note


if __name__ == "__main__":
    sys.exit(main())
