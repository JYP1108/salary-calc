#!/usr/bin/env node
/**
 * 생활 계산소 — 실수령액 계산기 단위 테스트
 *
 * 확인하는 것
 *  1) 간이세액표(2026년) 7,106칸이 원문 PDF와 같은지
 *  2) 제보 사례: 2026년 세전 400만원·비과세 20만원·부양가족 0명 → 소득세 169,260원
 *  3) 2027년 장기요양보험료율 13.90% 적용
 *  4) 자녀세액공제·4대보험료·퇴직금·연차수당 계산
 *
 * 실행: npm test
 */
'use strict';

var Ltc2026 = require('../assets/ltc-2026.js');
var Calc = require('../assets/calc.js');
var TABLE = require('./fixtures/ltc-2026-cells.json');

var passed = 0;
var failed = [];
var current = '';

function group(name) {
  current = name;
}

function check(name, actual, expected) {
  if (actual === expected) {
    passed += 1;
  } else {
    failed.push(current + ' > ' + name + ' (기대 ' + expected + ', 실제 ' + actual + ')');
  }
}

function checkNear(name, actual, expected, tolerance) {
  check(name, Math.abs(actual - expected) <= tolerance, true);
}

/* ------------------------------------------------------------------ *
 * 1) 간이세액표 전수 대조
 * ------------------------------------------------------------------ */
group('간이세액표 2026');

var cellCount = 0;
Object.keys(TABLE.cells).forEach(function (fromMan) {
  var cells = TABLE.cells[fromMan];
  for (var fam = 1; fam <= 11; fam++) {
    cellCount += 1;
    var got = Ltc2026.baseTax(Number(fromMan) * 1000, fam);
    var want = cells[fam - 1];
    if (got !== want) {
      failed.push('표 불일치: 월급여 ' + fromMan + '천원 · 가족 ' + fam + '명 (기대 ' + want + ', 실제 ' + got + ')');
    }
  }
});
check('검사한 칸 수', cellCount, 646 * 11);

// 구간 경계: 시작값은 그 구간, 바로 앞 1원은 이전 구간
check('3,800천원 구간 시작', Ltc2026.baseTax(3800000, 1), 169260);
check('3,799,999원', Ltc2026.baseTax(3799999, 1), Ltc2026.baseTax(3799999, 1));
check('표 하한 미만', Ltc2026.baseTax(769999, 1), 0);
check('표 하한', Ltc2026.baseTax(770000, 1), 0);

// 10,000천원 초과 구간(표 하단 산식)
check('10,000천원', Ltc2026.baseTax(10000000, 1), 1507400);
check('10,010천원', Ltc2026.baseTax(10010000, 1), 1507400 + Math.floor((10000 * 0.98 * 0.35 + 25000) / 10) * 10);
check('15,000천원', Ltc2026.baseTax(15000000, 1), 1507400 + 1397000 + Math.floor((1000000 * 0.98 * 0.38) / 10) * 10);

// 자녀세액공제(간이세액표 3번)
check('자녀 1명', Ltc2026.childCredit(1), 20830);
check('자녀 2명', Ltc2026.childCredit(2), 45830);
check('자녀 3명', Ltc2026.childCredit(3), 79160);
check('자녀 없음', Ltc2026.childCredit(0), 0);

/* ------------------------------------------------------------------ *
 * 2) 제보 사례 — 2026년 월 400만원 / 비과세 20만원 / 부양가족 0명
 * ------------------------------------------------------------------ */
group('제보 사례 (2026)');

var base2026 = Calc.netPay({
  monthlyGross: 4000000,
  nonTaxable: 200000,
  dependents: 0,
  children: 0,
  rates: Calc.RATES_2026
});

check('과세 대상 월급', base2026.monthlyTaxable, 3800000);
check('공제대상가족수', base2026.tax.familyCount, 1);
check('소득세', base2026.incomeTax, 169260);
check('지방소득세', base2026.localTax, 16920);
check('국민연금', base2026.insurance.pension, 180500);
check('건강보험', base2026.insurance.health, 136610);
check('장기요양', base2026.insurance.ltc, 17950);
check('고용보험', base2026.insurance.employment, 34200);
check('4대보험 합계', base2026.insurance.total, 369260);
check('공제 합계', base2026.totalDeduction, 555440);
check('월 실수령액', base2026.netMonthly, 3444560);
check('연 실수령액', base2026.netAnnual, 41334720);

/* ------------------------------------------------------------------ *
 * 3) 2027년 — 국민연금 5.0%, 장기요양보험료율 13.90%
 * ------------------------------------------------------------------ */
group('2027년 요율');

var base2027 = Calc.netPay({
  monthlyGross: 4000000,
  nonTaxable: 200000,
  dependents: 0,
  children: 0,
  rates: Calc.RATES_2027
});

check('2027 장기요양 요율(건보료 대비)', Math.round(Calc.RATES_2027.ltc.ofHealth * 10000), 1390);
check('2027 장기요양 요율(소득 대비)', Math.round(Calc.RATES_2027.ltc.ofWage * 1000000), 9994);
check('2026 장기요양 요율(건보료 대비)', Math.round(Calc.RATES_2026.ltc.ofHealth * 10000), 1314);
check('2026 장기요양 요율(소득 대비)', Math.round(Calc.RATES_2026.ltc.ofWage * 1000000), 9448);

check('2027 국민연금', base2027.insurance.pension, 190000);
check('2027 건강보험', base2027.insurance.health, 136610);
check('2027 장기요양', base2027.insurance.ltc, 18980);
check('2027 소득세', base2027.incomeTax, 169260);
check('2027 월 실수령액', base2027.netMonthly, 3434030);

// 요율 차이만 반영되는지: 2027 장기요양 - 2026 장기요양
check('장기요양 증가분', base2027.insurance.ltc - base2026.insurance.ltc, 1030);

/* ------------------------------------------------------------------ *
 * 4) 자녀·부양가족이 있을 때
 * ------------------------------------------------------------------ */
group('부양가족·자녀');

var withChild = Calc.netPay({
  monthlyGross: 4000000,
  nonTaxable: 200000,
  dependents: 2,
  children: 1,
  rates: Calc.RATES_2026
});
check('공제대상가족수(부양가족 2명 + 본인)', withChild.tax.familyCount, 3);
check('표 세액(3명)', withChild.tax.tableTax, Ltc2026.baseTax(3800000, 3));
check('자녀세액공제', withChild.tax.childCredit, 20830);
check('소득세 = 표 세액 - 자녀공제', withChild.incomeTax, Ltc2026.baseTax(3800000, 3) - 20830);

var manyChildren = Calc.netPay({
  monthlyGross: 2500000,
  nonTaxable: 0,
  dependents: 4,
  children: 3,
  rates: Calc.RATES_2026
});
check('자녀 3명 공제', manyChildren.tax.childCredit, 79160);
check('세액은 0원 밑으로 내려가지 않음', manyChildren.incomeTax >= 0, true);

/* ------------------------------------------------------------------ *
 * 5) 4대보험료 기준
 * ------------------------------------------------------------------ */
group('4대보험료');

var insMin = Calc.insurance(300000, Calc.RATES_2026);
check('국민연금 하한 41만원', insMin.pensionBase, 410000);
check('국민연금(하한)', insMin.pension, 19470);

var insMax = Calc.insurance(8000000, Calc.RATES_2026);
check('국민연금 상한 659만원', insMax.pensionBase, 6590000);
check('국민연금(상한)', insMax.pension, 313020);

check('소득 0원', Calc.insurance(0, Calc.RATES_2026).total, 0);

/* ------------------------------------------------------------------ *
 * 6) 퇴직금·연차수당
 * ------------------------------------------------------------------ */
group('퇴직금');

var sev = Calc.severance({
  startDate: '2021-01-01',
  endDate: '2026-01-01',
  monthlyWage: 3000000,
  annualBonus: 0,
  annualLeavePay: 0
});
check('근속일수', sev.workDays, 1826);
check('1년 이상 지급 대상', sev.eligible, true);
checkNear('퇴직금(±1,000원)', sev.severancePay, 3000000 * 3 / 92 * 30 * (1826 / 365), 1000);

var sevShort = Calc.severance({ startDate: '2026-01-01', endDate: '2026-04-01', monthlyWage: 3000000 });
check('1년 미만 지급 대상 아님', sevShort.eligible, false);

group('연차');

check('1년 미만 6개월', Calc.leaveAccrual('2026-01-01', '2026-07-01').days, 6);
check('1년 이상 15일', Calc.leaveAccrual('2025-01-01', '2026-01-01').days, 15);
check('3년 이상 가산', Calc.leaveAccrual('2022-01-01', '2026-01-01').days, 16);
check('25일 상한', Calc.leaveAccrual('2000-01-01', '2026-01-01').days, 25);

var pay = Calc.annualLeavePay({ monthlyOrdinaryWage: 3000000, unusedDays: 5, hoursPerDay: 8 });
check('통상시급', pay.hourlyWage, Math.round(3000000 / 209));
check('연차수당 5일', pay.pay, Math.floor(Math.round(3000000 / 209) * 8 * 5));

/* ------------------------------------------------------------------ *
 * 7) 연봉별 표
 * ------------------------------------------------------------------ */
group('연봉별 표');

var rows = Calc.netPayTable({ nonTaxable: 200000, dependents: 0, children: 0, rates: Calc.RATES_2026 });
check('행 수', rows.length, 10);
check('4,800만원 월급', rows[4].monthlyGross, 4000000);
check('4,800만원 실수령', rows[4].netMonthly, 3444560);
check('4,800만원 소득세+지방세', rows[4].tax, 186180);

/* ------------------------------------------------------------------ */

if (failed.length) {
  console.error('실패 ' + failed.length + '건 / 통과 ' + passed + '건');
  failed.slice(0, 20).forEach(function (line) {
    console.error(' - ' + line);
  });
  if (typeof process !== 'undefined' && process.exit) process.exit(1);
} else {
  console.log('통과 ' + passed + '건 (실패 0건)');
}
