// ===== Internationalization (i18n) =====

const TRANSLATIONS = {
  ja: {
    // Header
    'app.title': 'JAISTのりかえ',
    'header.about': 'このサービスについて',
    'header.themeToggle': 'テーマ切替',
    'header.back': '戻る',
    'settings.language': '言語',
    'settings.theme': 'テーマ',
    'settings.light': 'ライト',
    'settings.dark': 'ダーク',
    'header.dow.0': '日',
    'header.dow.1': '月',
    'header.dow.2': '火',
    'header.dow.3': '水',
    'header.dow.4': '木',
    'header.dow.5': '金',
    'header.dow.6': '土',
    'search.dateAria': '日付選択',
    'header.holiday': '祝',
    'holiday.missing': '${year}年の祝日データが登録されていません。祝日が平日ダイヤで表示される場合があります。',

    // Search controls
    'search.from': '出発',
    'search.to': '到着',
    'search.swap': '入れ替え',
    'search.reservationNotice': 'JAIST Shuttle 小松線は2時間前までに<a href="https://www.jaist.ac.jp/jaist_sds/reserve/" target="_blank" rel="noopener">予約</a>が必要',
    'status.reserveLink': '<a href="https://www.jaist.ac.jp/jaist_sds/reserve/" target="_blank" rel="noopener">予約する</a>',

    // Countdown
    'countdown.until': '出発まで',
    'countdown.departed': '出発済',
    'countdown.selectTrip': '便を選択してください',
    'countdown.serviceEnded': '本日はすべて出発済み',

    // Trip list
    'trip.noResults': '条件に合う便がありません',
    'trip.serviceEnded': '本日はすべて出発済み',
    'trip.nextDep': '次発',
    'trip.dep': '発',
    'trip.arr': '着',
    'trip.min': '分',
    'trip.remaining': 'あと',
    'trip.transfers': '乗換${n}回',
    'trip.transfers.1': '乗換${n}回',
    'trip.walkTransfer': '徒歩（乗換${n}分）',
    'trip.waitTransfer': '乗換${n}分',

    // Time format
    'time.hourMin': '${h}時間${m}分',
    'time.min': '${m}分',
    'time.h': '時間',
    'time.m': '分',
    'time.s': '秒',

    // Status
    'status.before': '出発前',
    'status.running': '運行中',
    'status.arrived': '到着済',
    'status.boarding': '乗車',
    'status.alighting': '降車',
    'status.train': '電車',
    'status.bus': 'バス',
    'status.midStops': '途中${n}駅',
    'status.midProgress': '（${passed}/${total}駅通過）',
    'status.walkTransfer': '徒歩（乗換${n}分）',
    'status.waitTransfer': '乗換（${n}分待）',
    'status.selectTrip': '便検索タブで便を選択してください',

    // Map
    'map.selectTrip': '便を選択してください',
    'map.waiting': '待機中',
    'map.legendKomatsu': '小松駅経由',
    'map.legendTsurugi': '鶴来駅経由',

    // Nav
    'nav.search': '便検索',
    'nav.status': '詳細',
    'nav.map': 'マップ',

    // Favorites
    'fav.save': '現在のルートを保存',
    'fav.namePrompt': 'お気に入りの名前を入力:',
    'fav.delete': '削除',
    'fav.deleteConfirm': '「${name}」を削除しますか？',
    'fav.empty': '保存されたルートはありません',

    // Tutorial
    'tutorial.skip': 'スキップ',
    'tutorial.next': '次へ',
    'tutorial.prev': '戻る',
    'tutorial.done': 'はじめる',
    // Page 1 - Welcome
    'tutorial.welcome.title': 'JAISTのりかえ へようこそ',
    'tutorial.welcome.unofficial': '本サービスは各交通機関の<strong>公式サービスではありません</strong>。',
    'tutorial.welcome.static': '公式の時刻表データをもとに動作しており、<strong>リアルタイムの運行状況・遅延情報等は反映されません</strong>。',
    'tutorial.welcome.official': '正確な運行情報は各交通機関の公式サイトをご確認ください。',
    // Page 2 - Tabs
    'tutorial.tabs.title': '各タブの役割',
    'tutorial.tabs.search': '<strong>便検索</strong>：ルート・出発/到着を選んで便の一覧を表示します。次の便までのカウントダウンも確認できます。',
    'tutorial.tabs.status': '<strong>詳細</strong>：選択した便のタイムラインを表示します。乗車・乗換・降車の流れと待ち時間がわかります。',
    'tutorial.tabs.map': '<strong>マップ</strong>：経路とバスの推定位置を地図上に表示します。位置は時刻表ベースの概算です。',
    // Page 3 - Header
    'tutorial.header.title': 'ヘッダーの機能',
    'tutorial.header.about': '<strong>情報</strong>：免責事項やデータ出典などの詳細情報を確認できます。',
    'tutorial.header.settings': '<strong>表示設定</strong>：言語（日/英）とテーマ（ライト/ダーク）を切り替えられます。',
    'tutorial.header.fav': '<strong>ルート保存</strong>：よく使うルートを保存して、ワンタップで切り替えられます。',
    // Page 4 - Done
    'tutorial.done.title': '準備完了！',
    'tutorial.done.pwa': 'ホーム画面に追加すると、アプリのように使えます（PWA対応）。',
    'tutorial.done.reshow': 'この使い方ガイドは「このサービスについて」ページからいつでも再表示できます。',

    // Route presets
    'route.jaist_komatsu': 'JAIST↔小松駅',
    'route.jaist_tsurugi': 'JAIST↔鶴来駅',
    'route.jaist_tsurugi_kanazawa': 'JAIST↔鶴来駅↔金沢駅',
    'route.jaist_tsurugi_nomachi': 'JAIST↔鶴来駅↔野町駅',
    'route.jaist_komatsu_kanazawa': 'JAIST↔小松駅↔金沢駅',
    'route.jaist_komatsu_airport': 'JAIST↔小松駅↔小松空港',

    // About page
    'about.title': 'このサービスについて - JAISTのりかえ',
    'about.appName': 'JAISTのりかえ',
    'about.appVersion': '2026年6月版ダイヤ準拠',
    'about.aboutHeading': 'このサービスについて',
    'about.aboutText': 'JAISTと周辺地域を結ぶ交通手段の時刻表・乗換案内サービスです。以下の路線に対応しています。',
    'about.route.shuttle': 'JAISTシャトルバス',
    'about.route.shuttleDesc': '鶴来線（JAIST↔鶴来駅）・小松線（JAIST↔小松駅）',
    'about.route.ishikawa': '北陸鉄道 石川線',
    'about.route.ishikawaDesc': '鶴来駅↔野町駅',
    'about.route.ir': 'IRいしかわ鉄道',
    'about.route.irDesc': '小松駅↔金沢駅',
    'about.route.limo': '小松空港連絡バス',
    'about.route.limoDesc': '小松駅↔小松空港',
    'about.aboutFooter': 'JAISTから金沢駅・小松空港などへの乗換ルートを検索し、次の便や所要時間を確認できます。',
    'about.staticNotice': '本サービスは公式時刻表のデータに基づく静的な情報提供ツールです。リアルタイムの運行状況・位置情報・遅延情報等は反映されません。',
    'about.disclaimerHeading': '免責事項',
    'about.disclaimer.1': '本サービスはJAISTおよび各交通機関（IRいしかわ鉄道・北陸鉄道等）の公式サービスではありません。学生サークルが独自に開発した非公式の情報提供ツールです。',
    'about.disclaimer.2': '時刻表データや経路情報には誤りが含まれる可能性があります。内容の正確性・最新性を保証するものではありません。',
    'about.disclaimer.3': '本サービスの利用により生じたいかなる損害（乗り遅れ等を含む）についても、開発者は責任を負いかねます。',
    'about.disclaimer.4': '正確な運行情報については、各交通機関の公式サイトにてご確認ください。',
    'about.techHeading': 'データと仕組みについて',
    'about.tech.static': '本サービスは独自のサーバーを持たず、ユーザーデータの収集や送信は行っていません（フォント・地図等の外部サービスとの最低限の通信を除く）。',
    'about.tech.timetable': '時刻表データは各交通機関の公式時刻表PDFからプログラムで自動抽出して生成しています。リアルタイムの運行状況・遅延情報等は反映されません。',
    'about.tech.validity': '時刻表データには有効期間があり、ダイヤ改正により内容が変わる場合があります。最新のダイヤは各交通機関の公式サイトをご確認ください。',
    'about.tech.airport': '小松空港→小松駅の発車時刻は、航空便到着の約15分後・所要約12分として算出した推定値です。',
    'about.tech.transfer': '乗換検索では乗換駅ごとに設定された乗換時間（1〜5分）を用いて計算しています。実際の乗換には余裕をもって移動することをお勧めします。',
    'about.tech.latestConn': '乗換がある経路では、乗換駅での待ち時間が最も短くなるよう、できるだけ遅い便を選んで表示しています。余裕をもって早めの便に乗ることもご検討ください。',
    'about.tech.map': 'マップ上の経路やバス停・駅の位置は推測に基づいており、正確な位置を保証するものではありません。',
    'about.tech.storage': 'お気に入りルートや表示設定（テーマ・言語）はお使いのブラウザに保存されます。ブラウザのサイトデータを削除した場合やプライベートモードでは保存されません。',
    'about.timetableHeading': '時刻表を確認する',
    'about.timetableText': '本サービスで使用している全路線の時刻表データを一覧で確認できます。',
    'about.timetableLink': '時刻表一覧ページを開く',
    'about.sourceHeading': '時刻表データの出典',
    'about.sourceText': '本サービスの時刻表データは、以下の公式情報に基づいています。最新のダイヤは各公式ページをご確認ください。',
    'about.source.jaist': 'JAIST アクセス情報',
    'about.source.jaistDesc': 'シャトルバス時刻表（鶴来線・小松線）',
    'about.source.ir': 'IRいしかわ鉄道 時刻表',
    'about.source.hokutetsu': '北陸鉄道 石川線',
    'about.source.limo': '北陸鉄道 空港連絡バス',
    'about.source.nomi': 'のみバス（能美市）',
    'about.licenseHeading': 'ライセンス・帰属表示',
    'about.license.noto': 'Google Fonts より提供。SIL Open Font License 1.1 に基づき使用しています。',
    'about.license.leaflet': 'を使用しています。',
    'about.license.osm': '地図データは OpenStreetMap contributors より提供されています。',
    'about.license.busIcon': '本サービスで使用しているバスアイコン画像の著作権は、それぞれの作成者に帰属します。',
    'about.devHeading': '開発',
    'about.tutorialHeading': '使い方ガイド',
    'about.tutorialText': '初回起動時に表示されるサービスの使い方ガイドを再表示できます。',
    'about.tutorialLink': '使い方ガイドを表示する',

    // Timetable page
    'timetable.title': '時刻表一覧 - JAISTのりかえ',
    'timetable.selectRoute': '-- 路線を選択 --',
    'timetable.weekday': '平日',
    'timetable.weekend': '土日祝',
    'timetable.loading': '読み込み中...',
    'timetable.loadError': '読み込みに失敗しました: ',
    'timetable.selectPrompt': '路線を選択してください',
    'timetable.sourceLink': '公式時刻表を確認',
    'timetable.stopHeader': 'バス停/駅',
    'timetable.tripNum': '${n}便',
    'timetable.route.shuttle_tsurugi': 'JAIST Shuttle 鶴来線',
    'timetable.route.shuttle_komatsu': 'JAIST Shuttle 小松線',
    'timetable.route.ishikawa_line': '北陸鉄道 石川線',
    'timetable.route.ir_ishikawa': 'IRいしかわ鉄道',
    'timetable.route.ir_ishikawa_south': 'IRいしかわ鉄道',
    'timetable.route.ir_ishikawa_north': 'IRいしかわ鉄道',
    'timetable.route.limo_komatsu': '小松空港連絡バス',
    'timetable.route.nomi_renkei_kitamawari':   'のみバス 連携（朝夕・北廻り）',
    'timetable.route.nomi_renkei_minamimawari': 'のみバス 連携（朝夕・南廻り）',
    'timetable.route.nomi_renkei_nichu':        'のみバス 連携（日中）',
    'timetable.route.nomi_renkei_teraiko':      'のみバス 連携（朝・寺井高校）',
    'timetable.route.nomi_kanko_matsui':        'のみバス 観光（松井ミュージアム行）',
    'timetable.route.nomi_kanko_tojimura':      'のみバス 観光（陶芸村・辰口温泉行）',
    'timetable.route.nomi_junkan_negami':       'のみバス 循環（根上地区）',
    'timetable.route.nomi_junkan_terai':        'のみバス 循環（寺井地区）',
    'timetable.route.nomi_junkan_iwamoto':      'のみバス 循環（岩本方面）',
    'timetable.route.nomi_junkan_takaza':       'のみバス 循環（高座方面）',
    'timetable.route.nomi_junkan_nagaya':       'のみバス 循環（鍋谷方面）',
    'timetable.route.nomi_junkan_tsubono':      'のみバス 循環（坪野方面）',
  },

  en: {
    // Header
    'app.title': 'JAIST Norikae',
    'header.about': 'About this service',
    'header.themeToggle': 'Toggle theme',
    'header.back': 'Back',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.light': 'Light',
    'settings.dark': 'Dark',
    'header.dow.0': 'Sun.',
    'header.dow.1': 'Mon.',
    'header.dow.2': 'Tue.',
    'header.dow.3': 'Wed.',
    'header.dow.4': 'Thu.',
    'header.dow.5': 'Fri.',
    'header.dow.6': 'Sat.',
    'search.dateAria': 'Select date',
    'header.holiday': 'Hol.',
    'holiday.missing': 'Holiday data for ${year} is not registered. Holidays may show weekday timetables.',

    // Search controls
    'search.from': 'From',
    'search.to': 'To',
    'search.swap': 'Swap',
    'search.reservationNotice': 'JAIST Shuttle Komatsu Line requires <a href="https://www.jaist.ac.jp/jaist_sds/reserve/" target="_blank" rel="noopener">reservation</a> at least 2 hours in advance',
    'status.reserveLink': '<a href="https://www.jaist.ac.jp/jaist_sds/reserve/" target="_blank" rel="noopener">Reserve</a>',
    // Countdown
    'countdown.until': 'Departs in',
    'countdown.departed': 'Departed',
    'countdown.selectTrip': 'Select a trip',
    'countdown.serviceEnded': 'All departed for today',

    // Trip list
    'trip.noResults': 'No matching trips',
    'trip.serviceEnded': 'All departed for today',
    'trip.nextDep': 'Next',
    'trip.dep': 'dep',
    'trip.arr': 'arr',
    'trip.min': 'min',
    'trip.remaining': 'in ',
    'trip.transfers': '${n} transfers',
    'trip.transfers.1': '1 transfer',
    'trip.walkTransfer': 'Walk (${n} min)',
    'trip.waitTransfer': 'Transfer ${n} min',

    // Time format
    'time.hourMin': '${h}h ${m}min',
    'time.min': '${m}min',
    'time.h': 'h',
    'time.m': 'm',
    'time.s': 's',

    // Status
    'status.before': 'Before dep.',
    'status.running': 'Running',
    'status.arrived': 'Arrived',
    'status.boarding': 'Board',
    'status.alighting': 'Alight',
    'status.train': 'Train',
    'status.bus': 'Bus',
    'status.midStops': '${n} stops',
    'status.midProgress': '(${passed}/${total} passed)',
    'status.walkTransfer': 'Walk (${n} min transfer)',
    'status.waitTransfer': 'Transfer (${n} min wait)',
    'status.selectTrip': 'Select a trip in the Search tab',

    // Map
    'map.selectTrip': 'Select a trip',
    'map.waiting': 'Waiting',
    'map.legendKomatsu': 'Via Komatsu Sta.',
    'map.legendTsurugi': 'Via Tsurugi Sta.',

    // Nav
    'nav.search': 'Search',
    'nav.status': 'Details',
    'nav.map': 'Map',

    // Favorites
    'fav.save': 'Save current route',
    'fav.namePrompt': 'Enter a name for this favorite:',
    'fav.delete': 'Delete',
    'fav.deleteConfirm': 'Delete "${name}"?',
    'fav.empty': 'No saved routes',

    // Tutorial
    'tutorial.skip': 'Skip',
    'tutorial.next': 'Next',
    'tutorial.prev': 'Back',
    'tutorial.done': 'Get Started',
    // Page 1 - Welcome
    'tutorial.welcome.title': 'Welcome to JAIST Norikae',
    'tutorial.welcome.unofficial': 'This service is <strong>not an official service</strong> of any transit operator.',
    'tutorial.welcome.static': 'It operates based on official timetable data. <strong>Real-time service status and delay information are not reflected</strong>.',
    'tutorial.welcome.official': 'Please check each operator\'s official website for accurate service information.',
    // Page 2 - Tabs
    'tutorial.tabs.title': 'Tab Overview',
    'tutorial.tabs.search': '<strong>Search</strong>: Select a route and stops to view the trip list. A countdown to the next departure is also shown.',
    'tutorial.tabs.status': '<strong>Details</strong>: View the timeline of a selected trip — boarding, transfers, alighting, and wait times.',
    'tutorial.tabs.map': '<strong>Map</strong>: View the route and estimated bus position on the map. Positions are approximate, based on the timetable.',
    // Page 3 - Header
    'tutorial.header.title': 'Header Controls',
    'tutorial.header.about': '<strong>Info</strong>: View disclaimers, data sources, and other details.',
    'tutorial.header.settings': '<strong>Display</strong>: Switch language (JA/EN) and theme (light/dark).',
    'tutorial.header.fav': '<strong>Favorites</strong>: Save frequently used routes and switch with one tap.',
    // Page 4 - Done
    'tutorial.done.title': 'You\'re All Set!',
    'tutorial.done.pwa': 'Add to your home screen to use it like a native app (PWA).',
    'tutorial.done.reshow': 'You can view this guide again from the About page.',

    // Route presets
    'route.jaist_komatsu': 'JAIST↔Komatsu Sta.',
    'route.jaist_tsurugi': 'JAIST↔Tsurugi Sta.',
    'route.jaist_tsurugi_kanazawa': 'JAIST↔Tsurugi Sta.↔Kanazawa Sta.',
    'route.jaist_tsurugi_nomachi': 'JAIST↔Tsurugi Sta.↔Nomachi Sta.',
    'route.jaist_komatsu_kanazawa': 'JAIST↔Komatsu Sta.↔Kanazawa Sta.',
    'route.jaist_komatsu_airport': 'JAIST↔Komatsu Sta.↔Komatsu Airport',

    // About page
    'about.title': 'About - JAIST Norikae',
    'about.appName': 'JAIST Norikae',
    'about.appVersion': 'Based on June 2026 timetable',
    'about.aboutHeading': 'About This Service',
    'about.aboutText': 'A timetable and transfer guide app for transportation connecting JAIST and surrounding areas. The following lines are supported:',
    'about.route.shuttle': 'JAIST Shuttle Bus',
    'about.route.shuttleDesc': 'Tsurugi Line (JAIST↔Tsurugi Sta.) / Komatsu Line (JAIST↔Komatsu Sta.)',
    'about.route.ishikawa': 'Hokuriku Railway Ishikawa Line',
    'about.route.ishikawaDesc': 'Tsurugi Sta.↔Nomachi Sta.',
    'about.route.ir': 'IR Ishikawa Railway',
    'about.route.irDesc': 'Komatsu Sta.↔Kanazawa Sta.',
    'about.route.limo': 'Komatsu Airport Shuttle',
    'about.route.limoDesc': 'Komatsu Sta.↔Komatsu Airport',
    'about.aboutFooter': 'Search transfer routes from JAIST to Kanazawa Station, Komatsu Airport, etc., and check the next departure and travel time.',
    'about.staticNotice': 'This app is a static information tool based on official timetable data. Real-time service status, vehicle locations, and delay information are not reflected.',
    'about.disclaimerHeading': 'Disclaimer',
    'about.disclaimer.1': 'This app is not an official service of JAIST or any transportation operator (IR Ishikawa Railway, Hokuriku Railway, etc.). It is an unofficial information tool independently developed by a student club.',
    'about.disclaimer.2': 'Timetable data and route information may contain errors. Accuracy and currency of the content are not guaranteed.',
    'about.disclaimer.3': 'The developers assume no responsibility for any damages (including missed connections) arising from use of this app.',
    'about.disclaimer.4': 'Please check the official websites of each transportation operator for accurate service information.',
    'about.techHeading': 'Data & How It Works',
    'about.tech.static': 'This app does not have its own server and does not collect or transmit any user data (except minimal communication with external services for fonts, map tiles, etc.).',
    'about.tech.timetable': 'Timetable data is generated by automatically extracting information from official timetable PDFs. Real-time service status and delay information are not reflected.',
    'about.tech.validity': 'Timetable data has a validity period and may change with schedule revisions. Please check each operator\u0027s official website for the latest timetable.',
    'about.tech.airport': 'Departure times from Komatsu Airport to Komatsu Station are estimated as approximately 15 minutes after flight arrival with approximately 12 minutes travel time.',
    'about.tech.transfer': 'Transfer searches use per-station transfer times (1–5 minutes). We recommend allowing extra time when transferring.',
    'about.tech.latestConn': 'For routes with transfers, the app shows the latest possible departure to minimize waiting time at transfer stations. Consider taking an earlier service for extra margin.',
    'about.tech.map': 'Routes and stop/station positions on the map are based on estimates and do not guarantee actual positions.',
    'about.tech.storage': 'Favorite routes and display settings (theme, language) are saved in your browser. They will be lost if you clear site data or use private/incognito mode.',
    'about.timetableHeading': 'View Timetables',
    'about.timetableText': 'View timetable data for all routes used in this app.',
    'about.timetableLink': 'Open timetable page',
    'about.sourceHeading': 'Timetable Data Sources',
    'about.sourceText': 'The timetable data in this app is based on the following official sources. Please check each official page for the latest schedules.',
    'about.source.jaist': 'JAIST Access Information',
    'about.source.jaistDesc': 'Shuttle bus timetable (Tsurugi / Komatsu lines)',
    'about.source.ir': 'IR Ishikawa Railway Timetable',
    'about.source.hokutetsu': 'Hokuriku Railway Ishikawa Line',
    'about.source.limo': 'Hokuriku Railway Airport Bus',
    'about.source.nomi': 'Nomibus (Nomi City Community Bus)',
    'about.licenseHeading': 'Licenses & Attribution',
    'about.license.noto': 'Provided by Google Fonts. Used under SIL Open Font License 1.1.',
    'about.license.leaflet': 'Used under BSD 2-Clause License.',
    'about.license.osm': 'Map data provided by OpenStreetMap contributors.',
    'about.license.busIcon': 'Bus icon images used in this app are copyrighted by their respective creators.',
    'about.devHeading': 'Development',
    'about.tutorialHeading': 'User Guide',
    'about.tutorialText': 'You can view the app guide that is shown on first launch.',
    'about.tutorialLink': 'Show guide',

    // Timetable page
    'timetable.title': 'Timetable - JAIST Norikae',
    'timetable.selectRoute': '-- Select a route --',
    'timetable.weekday': 'Weekday',
    'timetable.weekend': 'Weekend',
    'timetable.loading': 'Loading...',
    'timetable.loadError': 'Failed to load: ',
    'timetable.selectPrompt': 'Select a route',
    'timetable.sourceLink': 'View official timetable',
    'timetable.stopHeader': 'Stop / Station',
    'timetable.tripNum': '#${n}',
    'timetable.route.shuttle_tsurugi': 'JAIST Shuttle Tsurugi Line',
    'timetable.route.shuttle_komatsu': 'JAIST Shuttle Komatsu Line',
    'timetable.route.ishikawa_line': 'Hokuriku Railway Ishikawa Line',
    'timetable.route.ir_ishikawa': 'IR Ishikawa Railway',
    'timetable.route.ir_ishikawa_south': 'IR Ishikawa Railway',
    'timetable.route.ir_ishikawa_north': 'IR Ishikawa Railway',
    'timetable.route.limo_komatsu': 'Komatsu Airport Shuttle',
    'timetable.route.nomi_renkei_kitamawari':   'Nomibus Renkei (Morning/Evening, North)',
    'timetable.route.nomi_renkei_minamimawari': 'Nomibus Renkei (Morning/Evening, South)',
    'timetable.route.nomi_renkei_nichu':        'Nomibus Renkei (Daytime)',
    'timetable.route.nomi_renkei_teraiko':      'Nomibus Renkei (Morning, Terai High School)',
    'timetable.route.nomi_kanko_matsui':        'Nomibus Kanko (Matsui Museum)',
    'timetable.route.nomi_kanko_tojimura':      'Nomibus Kanko (Ceramics Village & Tatsunokuchi Spa)',
    'timetable.route.nomi_junkan_negami':       'Nomibus Junkan (Negami Area)',
    'timetable.route.nomi_junkan_terai':        'Nomibus Junkan (Terai Area)',
    'timetable.route.nomi_junkan_iwamoto':      'Nomibus Junkan (Iwamoto)',
    'timetable.route.nomi_junkan_takaza':       'Nomibus Junkan (Takaza)',
    'timetable.route.nomi_junkan_nagaya':       'Nomibus Junkan (Nagaya)',
    'timetable.route.nomi_junkan_tsubono':      'Nomibus Junkan (Tsubono)',
  }
};

// Stop/station name translations (ja -> en)
const STOP_NAMES_EN = {
  'JAIST': 'JAIST',
  'ハイテクセンター前': 'Haiteku-mae',
  '宮竹ヘルスロード': 'Miyatake',
  '灯台笹': 'Todashino',
  '岩本': 'Iwamoto',
  '本鶴来': 'Hon-tsurugi',
  '鶴来本町': 'Tsurugi honmachi',
  '鶴来駅': 'Tsurugi Sta.',
  '小松駅': 'Komatsu Sta.',
  '小松空港': 'Komatsu Airport',
  '西町': 'Nishi-machi',
  '浜田町': 'Hamada-machi',
  '桜木町': 'Sakuragi-cho',
  '城南町': 'Jonan-cho',
  '浮柳': 'Ukiyanagi',
  '浮柳西': 'Ukiyanagi-Nishi',
  '大聖寺駅': 'Daishoji Sta.',
  '加賀温泉駅': 'Kagaonsen Sta.',
  '動橋駅': 'Iburihashi Sta.',
  '粟津駅': 'Awazu Sta.',
  '明峰駅': 'Meiho Sta.',
  '能美根上駅': 'Nomi-Neagari Sta.',
  '小舞子駅': 'Komaiko Sta.',
  '美川駅': 'Mikawa Sta.',
  '加賀笠間駅': 'Kaga-Kasama Sta.',
  '西松任駅': 'Nishi-Matto Sta.',
  '松任駅': 'Matto Sta.',
  '野々市駅': 'Nonoichi Sta.',
  '西金沢駅': 'Nishi-Kanazawa Sta.',
  '金沢駅': 'Kanazawa Sta.',
  '東金沢駅': 'Higashi-Kanazawa Sta.',
  '森本駅': 'Morimoto Sta.',
  '津幡駅': 'Tsubata Sta.',
  '倶利伽羅駅': 'Kurikara Sta.',
  '日御子駅': 'Hinomiko Sta.',
  '小柳駅': 'Koyanagi Sta.',
  '井口駅': 'Inokuchi Sta.',
  '道法寺駅': 'Dohoji Sta.',
  '曽谷駅': 'Sodani Sta.',
  '陽羽里駅': 'Hibari Sta.',
  '四十万駅': 'Shijima Sta.',
  '乙丸駅': 'Otomaru Sta.',
  '額住宅前駅': 'Nuka-Jutakumae Sta.',
  '馬替駅': 'Magae Sta.',
  '野々市工大前駅': 'Nonoichi-Kodaimae Sta.',
  '押野駅': 'Oshino Sta.',
  '新西金沢駅': 'Shin-Nishi-Kanazawa Sta.',
  '西泉駅': 'Nishiizumi Sta.',
  '野町駅': 'Nomachi Sta.',
};

/** Translate a stop/station name */
function tStop(name) {
  if (currentLang === 'ja') return name;
  return STOP_NAMES_EN[name] || name;
}

// Route name translations (ja -> en) keyed by route id
const ROUTE_NAMES_EN = {
  'tsurugi_outbound':        { name: 'JAIST Shuttle Tsurugi Line (JAIST → Tsurugi Sta.)', short_name: 'Tsurugi Line outbound' },
  'tsurugi_inbound':         { name: 'JAIST Shuttle Tsurugi Line (Tsurugi Sta. → JAIST)', short_name: 'Tsurugi Line inbound' },
  'komatsu_outbound':        { name: 'JAIST Shuttle Komatsu Line (JAIST → Komatsu Sta.)', short_name: 'Komatsu Line outbound' },
  'komatsu_inbound':         { name: 'JAIST Shuttle Komatsu Line (Komatsu Sta. → JAIST)', short_name: 'Komatsu Line inbound' },
  'jaist_komatsu_kanazawa':  { name: 'JAIST → Komatsu Sta. → Kanazawa Sta.', short_name: 'JAIST → Komatsu → Kanazawa' },
  'kanazawa_komatsu_jaist':  { name: 'Kanazawa Sta. → Komatsu Sta. → JAIST', short_name: 'Kanazawa → Komatsu → JAIST' },
  'jaist_tsurugi_kanazawa':  { name: 'JAIST → Tsurugi Sta. → Kanazawa Sta.', short_name: 'JAIST → Tsurugi → Kanazawa' },
  'kanazawa_tsurugi_jaist':  { name: 'Kanazawa Sta. → Tsurugi Sta. → JAIST', short_name: 'Kanazawa → Tsurugi → JAIST' },
  'jaist_komatsu_airport':   { name: 'JAIST → Komatsu Sta. → Komatsu Airport', short_name: 'JAIST → Komatsu → Airport' },
  'airport_komatsu_jaist':   { name: 'Komatsu Airport → Komatsu Sta. → JAIST', short_name: 'Airport → Komatsu → JAIST' },
};

// Segment route name translations (from segment JSON route.name)
const SEG_ROUTE_NAMES_EN = {
  'JAISTシャトル 鶴来線（大学 → 鶴来駅）': 'JAIST Shuttle Tsurugi Line (JAIST → Tsurugi Sta.)',
  'JAISTシャトル 鶴来線（鶴来駅 → 大学）': 'JAIST Shuttle Tsurugi Line (Tsurugi Sta. → JAIST)',
  'JAISTシャトル 小松線（大学 → 小松駅）': 'JAIST Shuttle Komatsu Line (JAIST → Komatsu Sta.)',
  'JAISTシャトル 小松線（小松駅 → 大学）': 'JAIST Shuttle Komatsu Line (Komatsu Sta. → JAIST)',
  '北陸鉄道 石川線（鶴来 → 野町）': 'Hokuriku Railway Ishikawa Line (Tsurugi → Nomachi)',
  '北陸鉄道 石川線（野町 → 鶴来）': 'Hokuriku Railway Ishikawa Line (Nomachi → Tsurugi)',
  'IRいしかわ鉄道（大聖寺 → 金沢）': 'IR Ishikawa Railway (Daishoji → Kanazawa)',
  'IRいしかわ鉄道（金沢 → 倶利伽羅）': 'IR Ishikawa Railway (Kanazawa → Kurikara)',
  'IRいしかわ鉄道（倶利伽羅 → 金沢）': 'IR Ishikawa Railway (Kurikara → Kanazawa)',
  'IRいしかわ鉄道（金沢 → 大聖寺）': 'IR Ishikawa Railway (Kanazawa → Daishoji)',
  '小松空港連絡バス（小松駅 → 小松空港）': 'Airport Shuttle (Komatsu Sta. → Komatsu Airport)',
  '小松空港連絡バス（小松空港 → 小松駅）': 'Airport Shuttle (Komatsu Airport → Komatsu Sta.)',
};

// Route note translations (from segment JSON route.note / meta.note)
const ROUTE_NOTES_EN = {
  '航空便到着の約15分後発車。小松駅まで概ね12分。時刻は目安です。': 'Departs approx. 15 min after flight arrival. Approx. 12 min to Komatsu Sta. Times are estimates.',
  '時刻が空欄の箇所は、通過または停車設定なしです。': 'Blank cells indicate the stop is passed through or not served.',
  '小松空港→小松駅の時刻は航空便到着の約15分後発車・約12分運行の推定値です。正確な時刻は元のPDFデータをご確認ください。': 'Komatsu Airport → Komatsu Sta. times are estimates (approx. 15 min after flight arrival, approx. 12 min ride). Please refer to the original PDF for exact times.',
};

// Operator name translations

/** Translate a route/meta note */
function tNote(jaText) {
  if (currentLang === 'ja') return jaText;
  return ROUTE_NOTES_EN[jaText] || jaText;
}

/** Get display label for a segment by its name (e.g., 'shuttle_komatsu' → 'JAIST Shuttle 小松線') */
function tSegLabel(segmentName) {
  const key = 'timetable.route.' + segmentName;
  return t(key);
}

/** Translate a segment route name (from JSON data) */
function tSegRouteName(jaName) {
  if (currentLang === 'ja') return jaName;
  return SEG_ROUTE_NAMES_EN[jaName] || jaName;
}

/** Translate a route's display name (picks short_name if available) */
function tRouteDisplay(routeId, shortName, fullName) {
  const jaName = shortName || fullName;
  if (currentLang === 'ja') return jaName;
  const en = ROUTE_NAMES_EN[routeId];
  if (!en) return jaName;
  return shortName ? en.short_name : en.name;
}

let currentLang = localStorage.getItem('lang') || 'ja';

/** Get translated string. Supports ${var} interpolation. */
function t(key, params) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.ja;
  let str = dict[key];
  if (str === undefined) {
    // Fallback to Japanese
    str = TRANSLATIONS.ja[key];
  }
  if (str === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace('${' + k + '}', v);
    }
  }
  return str;
}

/** Get translated string with plural support. Checks key + '.1' for n===1. */
function tPlural(key, n, params) {
  if (n === 1) {
    const singularKey = key + '.1';
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.ja;
    if (dict[singularKey] !== undefined) return t(singularKey, params);
  }
  return t(key, params);
}

/** Format countdown using i18n */
function formatCountdownI18n(diffMin) {
  if (diffMin < 0) return '--:--';
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return h > 0 ? t('time.hourMin', { h, m }) : t('time.min', { m });
}

/** Switch language and re-render UI */
function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.setAttribute('lang', lang);
  applyStaticTranslations();
  refreshUI();
}

/** Toggle settings dropdown */
function toggleSettingsDropdown() {
  const dd = document.getElementById('settings-dropdown');
  if (!dd) return;
  dd.classList.toggle('open');
  if (dd.classList.contains('open')) {
    // Close fav dropdown
    const favDd = document.getElementById('fav-dropdown');
    if (favDd) favDd.classList.remove('open');
    updateSettingsChecks();
  }
}

function closeSettingsDropdown() {
  const dd = document.getElementById('settings-dropdown');
  if (dd) dd.classList.remove('open');
}

/** Update check marks in settings dropdown */
function updateSettingsChecks() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  document.querySelectorAll('.settings-option').forEach(opt => {
    const setting = opt.dataset.setting;
    const value = opt.dataset.value;
    if (setting === 'lang') {
      opt.classList.toggle('active', value === currentLang);
    } else if (setting === 'theme') {
      opt.classList.toggle('active', value === currentTheme);
    }
  });
}

/** Handle settings option click */
function onSettingClick(e) {
  const opt = e.target.closest('.settings-option');
  if (!opt) return;
  const setting = opt.dataset.setting;
  const value = opt.dataset.value;
  if (setting === 'lang') {
    setLang(value);
  } else if (setting === 'theme') {
    document.documentElement.setAttribute('data-theme', value);
    localStorage.setItem('theme', value);
    applyStaticTranslations();
  }
  updateSettingsChecks();
}

/** Initialize settings dropdown */
function initSettingsDropdown() {
  const btn = document.getElementById('settings-dropdown-btn');
  if (btn) btn.addEventListener('click', toggleSettingsDropdown);
  const backdrop = document.getElementById('settings-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeSettingsDropdown);
  const menu = document.getElementById('settings-dropdown-menu');
  if (menu) menu.addEventListener('click', onSettingClick);
}

/** Apply translations to elements with data-i18n attributes */
function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });

  // Update page title (use page-specific key if set, else app.title)
  const titleKey = document.documentElement.dataset.i18nTitle || 'app.title';
  document.title = t(titleKey);

  // Update header date/dow
  updateHeaderDate();

  // Update settings dropdown checks
  if (typeof updateSettingsChecks === 'function') updateSettingsChecks();

  // Update route select options (main page only)
  if (typeof ROUTE_PRESETS !== 'undefined') {
    document.querySelectorAll('.route-select').forEach(sel => {
      const currentVal = sel.value;
      sel.querySelectorAll('option').forEach(opt => {
        const preset = ROUTE_PRESETS.find(p => p.id === opt.value);
        if (preset) opt.textContent = t(preset.i18nKey);
      });
      sel.value = currentVal;
    });
  }
}

/** Update header date and day-of-week display */
function updateHeaderDate() {
  const now = (typeof _getDebugDatetimeNow === 'function' && _getDebugDatetimeNow()) || new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const dow = now.getDay();

  const dateEl = document.getElementById('header-date');
  const dowEl = document.getElementById('header-dow');

  if (dateEl) dateEl.textContent = `${m}/${d}`;
  if (dowEl) {
    const dateStr = now.getFullYear() + '-' +
      String(m).padStart(2, '0') + '-' +
      String(d).padStart(2, '0');
    const isHoliday = typeof _holidaySet !== 'undefined' && _holidaySet.has(dateStr);
    const dowText = t('header.dow.' + dow);
    dowEl.textContent = isHoliday ? `(${dowText}・${t('header.holiday')})` : `(${dowText})`;
    dowEl.style.width = isHoliday ? 'auto' : '';
  }
}

/** Re-render dynamic content after language change (main page only) */
function refreshUI() {
  if (typeof DATA === 'undefined' || !DATA) return;

  // Rebuild date selects with translated weekday labels (keeps selection)
  if (typeof buildDateSelects === 'function') buildDateSelects();

  // Rebuild stop selects with translated names (keep selection)
  const savedFrom = selectedFromStop;
  const savedTo = selectedToStop;
  if (isMultiRoute(selectedRouteId)) {
    rebuildMultiStopSelects();
    // Restore selection
    selectedFromStop = savedFrom;
    document.querySelectorAll('.from-select').forEach(sel => { sel.value = savedFrom; });
    rebuildMultiToSelects();
    selectedToStop = savedTo;
    document.querySelectorAll('.to-select').forEach(sel => { sel.value = savedTo; });
    updateMultiTripList();
  } else {
    rebuildStopSelects();
    selectedFromStop = savedFrom;
    document.querySelectorAll('.from-select').forEach(sel => { sel.value = savedFrom; });
    rebuildToSelects();
    selectedToStop = savedTo;
    document.querySelectorAll('.to-select').forEach(sel => { sel.value = savedTo; });
    updateTripList();
  }
  if (currentTab === 'status') updateStatus();
  if (currentTab === 'map') {
    // Force map layer rebuild for translated tooltips
    prevRouteId = null;
    updateMap();
  }
  if (typeof renderFavDropdownList === 'function') renderFavDropdownList();
}
