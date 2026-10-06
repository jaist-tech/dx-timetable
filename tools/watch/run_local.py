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
import os
import subprocess
import sys
import tomllib

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clone", default=os.path.expanduser("~/project/tmp/dx-timetable-watch"))
    ap.add_argument("--remote", default=REMOTE)
    ap.add_argument("--base", default="origin/main", help="作業ブランチの起点（試験用）")
    ap.add_argument("--no-mail", action="store_true")
    args = ap.parse_args()
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
    changed = sh(["git", "status", "--porcelain", "public/data"], cwd=d).stdout.strip()
    needs = w.returncode == 10 or a.returncode == 10 or bool(changed)
    print(w.stdout, a.stdout, sep="\n")
    if not needs:
        return 0
    if changed:
        sh(["git", "add", "public/data", "tools/watch/state.json"], cwd=d)
        sh(["git", "-c", "user.name=msato", "-c", "user.email=s2510070@jaist.ac.jp", "commit", "-q", "-m",
            "時刻表の改定を自動で反映（検知・解析．要確認）"], cwd=d)
        stat = sh(["git", "diff", "--stat", f"{args.base}..HEAD", "--", "public/data"], cwd=d).stdout
    else:
        stat = "（public/data の変更なし）"

    report = f"{w.stdout}\n{a.stdout}"
    digest = hashlib.sha256(report.encode()).hexdigest()
    mark = os.path.join(d, ".git", "last_mailed")
    if os.path.exists(mark) and open(mark).read() == digest:
        print("前回のメールと同じ内容のため送らない")
        return 0
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
{a.stdout}"""
    if args.no_mail:
        print(body)
        return 0
    send_mail(f"[時刻表] 更新を検知（{branch}）", body)
    with open(mark, "w") as f:
        f.write(digest)
    print("メールを送信した")
    return 0


if __name__ == "__main__":
    sys.exit(main())
