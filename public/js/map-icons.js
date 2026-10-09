// ===== 地図の記号: バス停・駅・走行中の乗り物（Lucide の bus-front / train-front を SVG で埋め込み，ISC ライセンス）=====
// マップタブ（map.js）と経路検索の地図（route-picker.js）で共通に使う．Leaflet の divIcon を返す．
const MapIcons = (function () {
  const BUS = '<path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 21v-2"/>';
  const TRAIN = '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>';
  const glyph = (paths, px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

  // バス停: 柱の上に標識（丸）．駅: 角丸の四角．どちらも白い縁で明暗どちらの地図でも見える
  function stop(kind, color, size) {
    const s = size || 22;
    const isTrain = kind === 'train';
    const cls = 'mi-stop ' + (isTrain ? 'mi-station' : 'mi-busstop');
    const html = isTrain
      ? `<div class="${cls}" style="background:${color};width:${s}px;height:${s}px">${glyph(TRAIN, Math.round(s * .68))}</div>`
      : `<div class="${cls}" style="--c:${color};width:${s}px;height:${s + 6}px"><span class="mi-sign" style="background:${color};width:${s}px;height:${s}px">${glyph(BUS, Math.round(s * .68))}</span><span class="mi-pole" style="background:${color}"></span></div>`;
    return L.divIcon({ html, className: 'mi-wrap', iconSize: [s, isTrain ? s : s + 6], iconAnchor: [s / 2, isTrain ? s / 2 : s + 6] });
  }

  // 走行中の乗り物（電車区間は電車，バス区間は呼び出し側の既存のバス画像）
  function train(color, size) {
    const s = size || 38;
    return L.divIcon({
      html: `<div class="mi-vehicle" style="background:${color};width:${s}px;height:${s}px">${glyph(TRAIN, Math.round(s * .62))}</div>`,
      className: 'mi-wrap bus-icon-selected', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
    });
  }
  const PERSON = '<circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/>';
  function bus(color, size) {
    const s = size || 38;
    return L.divIcon({
      html: `<div class="mi-vehicle" style="background:${color};width:${s}px;height:${s}px">${glyph(BUS, Math.round(s * .62))}</div>`,
      className: 'mi-wrap', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
    });
  }
  // 人: 歩いている間は上下に揺れ（moving），待機中は止まる
  function person(moving, size) {
    const s = size || 32;
    return L.divIcon({
      html: `<div class="mi-vehicle mi-person${moving ? ' mi-walk' : ''}" style="background:#E65100;width:${s}px;height:${s}px">${glyph(PERSON, Math.round(s * .66))}</div>`,
      className: 'mi-wrap', iconSize: [s, s], iconAnchor: [s / 2, s / 2],
    });
  }
  return { stop, train, bus, person };
})();
