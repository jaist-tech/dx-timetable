// =================================================================
//  デバッグ設定
// =================================================================
//  アプリ全体（index / timetable / about）で共有される唯一のデバッグスイッチ。
//  本番デプロイ前に必ず null に戻すこと。
//
//  このファイルは index.html / timetable.html / about.html すべてで
//  先頭に読み込まれる。
// =================================================================

// --- アプリの「現在時刻」を固定する --------------------------------
//
// この値が文字列なら、アプリ全体（時計・便表示・カウントダウン・マップ・
// 特別ダイヤ判定など）がその時刻を「今」として動作する。
// 全ページ・全機能で完全に同じ時刻が使われる。
//
// 使い方:
//   有効化: '2026-05-03 12:00' のような 'YYYY-MM-DD HH:MM' 文字列
//   無効化: null (実時刻で動作)
const DEBUG_DATETIME = null;


// --- 以下は内部実装（変更不要） ---

let _debugDatetime = null;

function _getDebugDatetimeNow() {
  // 文字列以外（null/false/true 等）は無効扱い
  if (typeof DEBUG_DATETIME !== 'string' || !DEBUG_DATETIME) return null;
  if (!_debugDatetime || typeof _debugDatetime !== 'object') {
    const parsed = new Date(DEBUG_DATETIME);
    if (isNaN(parsed.getTime())) {
      console.warn('DEBUG_DATETIME format invalid:', DEBUG_DATETIME, '(use "YYYY-MM-DD HH:MM")');
      return null;
    }
    _debugDatetime = { date: parsed, startReal: Date.now() };
  }
  const elapsed = Date.now() - _debugDatetime.startReal;
  return new Date(_debugDatetime.date.getTime() + elapsed);
}

// 「今日」を YYYY-MM-DD 形式で返す（DEBUG_DATETIME 優先）
function debugTodayStr() {
  const now = _getDebugDatetimeNow() || new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}
