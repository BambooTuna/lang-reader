/**
 * test.js
 * hangul.js の変換ロジックに対する最小テスト。
 * 実行: node test.js
 * すべて assert で検証し、失敗時は例外により非ゼロ終了する。
 */
'use strict';

var assert = require('assert');
var Hangul = require('./hangul.js');

var passed = 0;

function check(label, input, expectedKana, expectedRoma) {
  var kana = Hangul.toKana(input);
  var roma = Hangul.toRoma(input);
  assert.strictEqual(kana, expectedKana,
    label + ': カタカナ不一致 (got "' + kana + '", expected "' + expectedKana + '")');
  assert.strictEqual(roma, expectedRoma,
    label + ': ローマ字不一致 (got "' + roma + '", expected "' + expectedRoma + '")');
  passed++;
  console.log('OK  ' + label + '  =>  ' + kana + ' / ' + roma);
}

// 1. 連音化: 終声ㄱ + 次の初声ㅇ → 移動
check('한국어 (liaison, g)', '한국어', 'ハングゴ', 'hangugeo');

// 2. 拗音(ㅕ)・ㅇ終声(ng, 連音しない)・ㅛ standalone
check('안녕하세요 (greeting)', '안녕하세요', 'アンニョンハセヨ', 'annyeonghaseyo');

// 3. 鼻音化は未実装のため非鼻音化の素の読みでよい (합니다 -> ハプニダ)
check('감사합니다 (no nasalization)', '감사합니다', 'カムサハプニダ', 'gamsahapnida');

// 4. 二重パッチム ㅄ -> 代表音ㅂ
check('값 (double batchim ㅄ->b)', '값', 'カプ', 'gap');

// 5. 二重パッチム ㄺ -> 代表音ㄱ
check('닭 (double batchim ㄺ->g)', '닭', 'タク', 'dak');

// 6. 連音化 + 語中の平音濁音化 (받다 -> 받아요)
check('받아요 (liaison, d)', '받아요', 'パダヨ', 'badayo');

// 7. 語頭・語中の平音の清濁 + wa/wo 系合拗音
check('고마워요 (voicing + wo)', '고마워요', 'コマウォヨ', 'gomawoyo');

// 8. ㅇ終声(ng)は連音化しない確認
check('사랑해요 (ng does not liaise)', '사랑해요', 'サランヘヨ', 'saranghaeyo');

// 9. ハングル + 記号 + 数字が混在するテキスト
(function () {
  var input = '안녕하세요! 123';
  var tokens = Hangul.convertText(input);
  assert.strictEqual(tokens.length, 2, '混在テキスト: トークン数');
  assert.strictEqual(tokens[0].type, 'word');
  assert.strictEqual(tokens[0].chars.map(function (c) { return c.kana; }).join(''), 'アンニョンハセヨ');
  assert.strictEqual(tokens[1].type, 'other');
  assert.strictEqual(tokens[1].text, '! 123');
  passed++;
  console.log('OK  混在テキスト (한글+記号+数字)  =>  ' + JSON.stringify(tokens));
})();

// 10. ハングルを含まないテキストはそのまま
(function () {
  var input = 'Hello, World! 123';
  var tokens = Hangul.convertText(input);
  assert.strictEqual(tokens.length, 1, '非ハングルテキスト: トークン数');
  assert.strictEqual(tokens[0].type, 'other');
  assert.strictEqual(tokens[0].text, input);
  passed++;
  console.log('OK  非ハングルテキストのパススルー');
})();

// 11. 空文字列
(function () {
  var tokens = Hangul.convertText('');
  assert.deepStrictEqual(tokens, [], '空文字列は空配列');
  passed++;
  console.log('OK  空文字列 => []');
})();

// 12. 1文字ごとの読みが取得できること（表示用データ構造の確認）
(function () {
  var tokens = Hangul.convertText('한국어');
  assert.strictEqual(tokens[0].chars.length, 3, '文字数が音節数と一致');
  assert.strictEqual(tokens[0].chars[0].char, '한');
  assert.strictEqual(tokens[0].chars[0].kana, 'ハン');
  assert.strictEqual(tokens[0].chars[0].roma, 'han');
  assert.strictEqual(tokens[0].chars[1].char, '국');
  assert.strictEqual(tokens[0].chars[1].kana, 'グ');
  assert.strictEqual(tokens[0].chars[1].roma, 'gu');
  assert.strictEqual(tokens[0].chars[2].char, '어');
  assert.strictEqual(tokens[0].chars[2].kana, 'ゴ');
  assert.strictEqual(tokens[0].chars[2].roma, 'geo');
  passed++;
  console.log('OK  1文字単位の読みデータ構造');
})();

console.log('\n' + passed + ' 件のテストがすべて成功しました。');
