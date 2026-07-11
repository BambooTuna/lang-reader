/**
 * hangul.js
 * ハングル → カタカナ／ローマ字（Revised Romanization ベース）変換ロジック。
 *
 * 純粋関数のみ。ブラウザ（<script src="hangul.js">` → window.HangulReader）と
 * Node（require('./hangul.js')）の両方で動くよう UMD 風にラップしている。
 *
 * ---------------------------------------------------------------------------
 * 実装している発音規則（最低限のみ）
 *  1. 連音化: 終声＋次音節の初声ㅇ(無音) → 終声を次の初声として読む。
 *             ただし終声ㅇ(ng) は移動しない。
 *  2. 終声の代表音化: 発音上の終声を ㄱ/ㄴ/ㄷ/ㄹ/ㅁ/ㅂ/ㅇ の7代表音に落とす。
 *  3. 語頭かどうかによる平音(ㄱ/ㄷ/ㅂ/ㅈ)の清濁（語頭は無声、語中は有声）。
 *     ※実際の韓国語では前後の音の性質でさらに細かく変わるが、本実装では
 *       「単語内で先頭の文字かどうか」のみで判定する簡略版。
 *
 * 実装していない規則（意図的に対象外。コメントのみ）
 *  - 鼻音化（例: 합니다 の ㅂ+ㄴ → ㅁ+ㄴ）
 *  - 流音化（例: 신라 → シルラ）
 *  - 激音化（例: 좋다 → チョタ）
 *  - 二重パッチムの片方のみが連音するケース（값이 → 갑씨 のような ㅅ の移動等）
 *    本実装では二重パッチムは代表音1つに単純化してから連音化を行う。
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.HangulReader = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HANGUL_BASE = 0xAC00;
  var HANGUL_LAST = 0xD7A3;

  // ------------------------------------------------------------------
  // 初声 (Choseong) 19個
  // 順序: ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ
  // ------------------------------------------------------------------
  var CHOSEONG_ROMA = [
    'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
    'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'
  ];

  var CHOSEONG_SILENT_INDEX = 11; // ㅇ

  // 語頭か語中かで清濁が変わる平音 (ㄱ, ㄷ, ㅂ, ㅈ) のインデックス
  var VOICING_TARGETS = [0, 3, 7, 12];

  // 各行は [a, i, u, e, o] の5つのカナ
  var CHOSEONG_ROW_UNVOICED = {
    0: ['カ', 'キ', 'ク', 'ケ', 'コ'],       // ㄱ（語頭）
    3: ['タ', 'チ', 'ツ', 'テ', 'ト'],       // ㄷ（語頭）
    7: ['パ', 'ピ', 'プ', 'ペ', 'ポ'],       // ㅂ（語頭）
    12: ['チャ', 'チ', 'チュ', 'チェ', 'チョ'] // ㅈ（語頭）
  };
  var CHOSEONG_ROW_VOICED = {
    0: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'],       // ㄱ（語中）
    3: ['ダ', 'ヂ', 'ヅ', 'デ', 'ド'],       // ㄷ（語中）
    7: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'],       // ㅂ（語中）
    12: ['ジャ', 'ジ', 'ジュ', 'ジェ', 'ジョ'] // ㅈ（語中）
  };
  var CHOSEONG_ROW_FIXED = {
    1: ['カ', 'キ', 'ク', 'ケ', 'コ'],        // ㄲ
    2: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'],        // ㄴ
    4: ['タ', 'チ', 'ツ', 'テ', 'ト'],        // ㄸ
    5: ['ラ', 'リ', 'ル', 'レ', 'ロ'],        // ㄹ
    6: ['マ', 'ミ', 'ム', 'メ', 'モ'],        // ㅁ
    8: ['パ', 'ピ', 'プ', 'ペ', 'ポ'],        // ㅃ
    9: ['サ', 'シ', 'ス', 'セ', 'ソ'],        // ㅅ
    10: ['サ', 'シ', 'ス', 'セ', 'ソ'],       // ㅆ
    11: ['ア', 'イ', 'ウ', 'エ', 'オ'],       // ㅇ（無音。通常は標準形テーブルを使う）
    13: ['チャ', 'チ', 'チュ', 'チェ', 'チョ'], // ㅉ
    14: ['チャ', 'チ', 'チュ', 'チェ', 'チョ'], // ㅊ
    15: ['カ', 'キ', 'ク', 'ケ', 'コ'],       // ㅋ
    16: ['タ', 'チ', 'ツ', 'テ', 'ト'],       // ㅌ
    17: ['パ', 'ピ', 'プ', 'ペ', 'ポ'],       // ㅍ
    18: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ']        // ㅎ
  };

  function getChoseongRow(choIdx, isWordInitial) {
    if (VOICING_TARGETS.indexOf(choIdx) !== -1) {
      return isWordInitial ? CHOSEONG_ROW_UNVOICED[choIdx] : CHOSEONG_ROW_VOICED[choIdx];
    }
    return CHOSEONG_ROW_FIXED[choIdx];
  }

  // ------------------------------------------------------------------
  // 中声 (Jungseong) 21個
  // 順序: ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ
  // ------------------------------------------------------------------
  var JUNGSEONG_ROMA = [
    'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
    'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'
  ];

  // 初声が無音(ㅇ)のときに直接使うカタカナ
  var JUNGSEONG_STANDALONE_KANA = [
    'ア', 'エ', 'ヤ', 'イェ', 'オ', 'エ', 'ヨ', 'イェ', 'オ', 'ワ',
    'ウェ', 'ウェ', 'ヨ', 'ウ', 'ウォ', 'ウェ', 'ウィ', 'ユ', 'ウ', 'ウィ', 'イ'
  ];

  // 子音行 [a,i,u,e,o] のどの列と組み合わせるか（'plain'）
  // もしくは 子音行のi列/u列 + 小さいカナ で作る拗音・合拗音('y'/'w')
  var COL_A = 0, COL_I = 1, COL_U = 2, COL_E = 3, COL_O = 4;
  var JUNGSEONG_COMBINE = [
    { type: 'plain', col: COL_A },   // ㅏ a
    { type: 'plain', col: COL_E },   // ㅐ ae -> エ
    { type: 'y', small: 'ャ' },      // ㅑ ya
    { type: 'y', small: 'ェ' },      // ㅒ yae（簡略化: イェ相当）
    { type: 'plain', col: COL_O },   // ㅓ eo -> オ
    { type: 'plain', col: COL_E },   // ㅔ e -> エ
    { type: 'y', small: 'ョ' },      // ㅕ yeo -> y+オ列
    { type: 'y', small: 'ェ' },      // ㅖ ye
    { type: 'plain', col: COL_O },   // ㅗ o
    { type: 'w', small: 'ァ' },      // ㅘ wa
    { type: 'w', small: 'ェ' },      // ㅙ wae
    { type: 'w', small: 'ェ' },      // ㅚ oe（簡略化: wae と同じ）
    { type: 'y', small: 'ョ' },      // ㅛ yo
    { type: 'plain', col: COL_U },   // ㅜ u
    { type: 'w', small: 'ォ' },      // ㅝ wo
    { type: 'w', small: 'ェ' },      // ㅞ we
    { type: 'w', small: 'ィ' },      // ㅟ wi
    { type: 'y', small: 'ュ' },      // ㅠ yu
    { type: 'plain', col: COL_U },   // ㅡ eu -> ウ（最も近い音）
    { type: 'plain', col: COL_I },   // ㅢ ui -> 簡略化してイ扱い
    { type: 'plain', col: COL_I }    // ㅣ i
  ];

  function combineKana(choIdx, jungIdx, isWordInitial) {
    if (choIdx === CHOSEONG_SILENT_INDEX) {
      return JUNGSEONG_STANDALONE_KANA[jungIdx];
    }
    var row = getChoseongRow(choIdx, isWordInitial);
    var cat = JUNGSEONG_COMBINE[jungIdx];
    if (cat.type === 'plain') return row[cat.col];
    if (cat.type === 'y') return row[COL_I] + cat.small;
    if (cat.type === 'w') return row[COL_U] + cat.small;
    return '';
  }

  // ------------------------------------------------------------------
  // 終声 (Jongseong) 28個（0=なし含む）
  // 順序: (なし)ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ
  //
  // 代表音カテゴリ 'none'|'g'|'n'|'d'|'l'|'m'|'b'|'ng' に単純化する。
  // 二重パッチムも「代表的なもの」に落とす（例: ㄳ→ㄱ, ㄵ→ㄴ, ㄼ→ㄹ）。
  // ------------------------------------------------------------------
  var JONGSEONG_CATEGORY = [
    'none', 'g', 'g', 'g',   // (なし) ㄱ ㄲ ㄳ
    'n', 'n', 'n', 'd',      // ㄴ ㄵ ㄶ ㄷ
    'l', 'g', 'm', 'l',      // ㄹ ㄺ ㄻ ㄼ
    'l', 'l', 'b', 'l',      // ㄽ ㄾ ㄿ ㅀ
    'm', 'b', 'b', 'd',      // ㅁ ㅂ ㅄ ㅅ
    'd', 'ng', 'd', 'd',     // ㅆ ㅇ ㅈ ㅊ
    'g', 'd', 'b', 'd'       // ㅋ ㅌ ㅍ ㅎ
  ];

  // カタカナ表記方針:
  //   終声ㄴ/ㅇ→「ン」、終声ㅁ→「ム」（キムチ等の慣用表記に合わせる）、
  //   終声ㄱ→「ク」、ㄷ→「ッ」、ㄹ→「ル」、ㅂ→「プ」
  var REP_KATAKANA = { none: '', g: 'ク', n: 'ン', d: 'ッ', l: 'ル', m: 'ム', b: 'プ', ng: 'ン' };
  var REP_ROMA = { none: '', g: 'k', n: 'n', d: 't', l: 'l', m: 'm', b: 'p', ng: 'ng' };

  // 連音化で次の初声に移動する際に使う初声インデックス
  var REP_TO_CHOSEONG_INDEX = { g: 0, n: 2, d: 3, l: 5, m: 6, b: 7 }; // ng は移動しない

  // ------------------------------------------------------------------
  // ハングル音節の分解・組み立て
  // ------------------------------------------------------------------
  function isHangulSyllable(ch) {
    if (!ch) return false;
    var code = ch.charCodeAt(0);
    return code >= HANGUL_BASE && code <= HANGUL_LAST;
  }

  function decomposeSyllable(ch) {
    var S = ch.charCodeAt(0) - HANGUL_BASE;
    var cho = Math.floor(S / 588);
    var jung = Math.floor((S % 588) / 28);
    var jongIdx = S % 28;
    return {
      char: ch,
      cho: cho,
      jung: jung,
      jongCategory: JONGSEONG_CATEGORY[jongIdx]
    };
  }

  // 連音化: 終声(代表音, ng以外)＋次の初声がㅇ(無音) → 終声を次の初声へ移動
  function applyLiaison(sylList) {
    var list = sylList.map(function (s) {
      return { char: s.char, cho: s.cho, jung: s.jung, jongCategory: s.jongCategory };
    });
    for (var i = 0; i < list.length - 1; i++) {
      var cat = list[i].jongCategory;
      if (cat !== 'none' && cat !== 'ng' && list[i + 1].cho === CHOSEONG_SILENT_INDEX) {
        list[i + 1].cho = REP_TO_CHOSEONG_INDEX[cat];
        list[i].jongCategory = 'none';
      }
    }
    return list;
  }

  function renderSyllable(syl, isWordInitial) {
    var kana = combineKana(syl.cho, syl.jung, isWordInitial) + REP_KATAKANA[syl.jongCategory];
    var roma = CHOSEONG_ROMA[syl.cho] + JUNGSEONG_ROMA[syl.jung] + REP_ROMA[syl.jongCategory];
    return { char: syl.char, kana: kana, roma: roma };
  }

  /**
   * テキストを {type:'word', chars:[{char,kana,roma}, ...]} /
   * {type:'other', text:'...'} のブロック列に変換する。
   * ハングル音節が連続する範囲を1つの「単語」ブロックとして連音化を適用し、
   * それ以外（空白・改行・数字・記号・ラテン文字等）は 'other' としてそのまま保持する。
   */
  function convertText(text) {
    var tokens = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      if (isHangulSyllable(text[i])) {
        var raw = [];
        while (i < n && isHangulSyllable(text[i])) {
          raw.push(decomposeSyllable(text[i]));
          i++;
        }
        var processed = applyLiaison(raw);
        var chars = processed.map(function (s, idx) {
          return renderSyllable(s, idx === 0);
        });
        tokens.push({ type: 'word', chars: chars });
      } else {
        var start = i;
        while (i < n && !isHangulSyllable(text[i])) i++;
        tokens.push({ type: 'other', text: text.slice(start, i) });
      }
    }
    return tokens;
  }

  function toKana(text) {
    return convertText(text).map(function (t) {
      return t.type === 'word' ? t.chars.map(function (c) { return c.kana; }).join('') : t.text;
    }).join('');
  }

  function toRoma(text) {
    return convertText(text).map(function (t) {
      return t.type === 'word' ? t.chars.map(function (c) { return c.roma; }).join('') : t.text;
    }).join('');
  }

  return {
    convertText: convertText,
    toKana: toKana,
    toRoma: toRoma,
    isHangulSyllable: isHangulSyllable,
    decomposeSyllable: decomposeSyllable
  };
});
