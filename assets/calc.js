/*!
 * 생활 계산소 - 계산 엔진 (calc.js)
 * 순수 함수만 담당합니다. DOM을 건드리지 않으므로 브라우저/테스트 양쪽에서 그대로 실행됩니다.
 *
 * 기준일: 2026년 11월 28일
 *  - 국민연금 9.5%(근로자 4.75%), 기준소득월액 하한 41만원·상한 659만원 (2026.7~2027.6)
 *  - 건강보험 7.19%(근로자 3.595%), 장기요양보험료 = 건강보험료 × 13.14% (2027년 13.90%)
 *  - 고용보험(실업급여) 1.8%(근로자 0.9%)
 *  - 소득세: 국세청 근로소득 간이세액표(소득세법 시행령 별표 2, 개정 2026. 2. 27.)를 그대로 적용
 *    — 표는 ltc-2026.js에 담겨 있고, 8세 이상 20세 이하 자녀는 표의 자녀 수별 금액을 뺍니다.
 *  - 2026년 최저임금 시급 10,320원(월 209시간 2,156,880원)
 */
(function (global) {
  'use strict';

  /* 간이세액표 모듈. 브라우저에서는 ltc-2026.js를 먼저 읽고, 테스트에서는 require로 가져옵니다. */
  var LTC = global.Ltc2026;
  if (!LTC && typeof require === 'function') {
    try {
      LTC = require('./ltc-2026.js');
    } catch (e) {
      LTC = null;
    }
  }

  /* ------------------------------------------------------------------ *
   * 1. 요율 상수
   * ------------------------------------------------------------------ */

  var RATES_2026 = {
    key: '2026',
    label: '2026년',
    note: '2026년 11월 기준 확정 요율',
    pension: { employee: 0.0475, total: 0.095, minBase: 410000, maxBase: 6590000 },
    health: { employee: 0.03595, total: 0.0719 },
    ltc: { ofHealth: 0.1314, ofWage: 0.009448 },
    employment: { employee: 0.009, total: 0.018 },
    minimumWage: { hourly: 10320, monthly: 2156880 }
  };

  // 2027년: 국민연금 10%(근로자 5%)와 건강보험 7.19% 동결, 장기요양보험료율은 건강보험료의 13.90%
  // (2026. 10. 30. 장기요양위원회 의결 · 소득 대비 0.9994%)까지 반영했습니다. 고용보험은 2026년 요율로 가정합니다.
  var RATES_2027 = {
    key: '2027',
    label: '2027년(예정)',
    note: '국민연금 5.0% · 장기요양 13.90% 반영, 고용보험은 2026년 요율로 가정',
    pension: { employee: 0.05, total: 0.1, minBase: 410000, maxBase: 6590000 },
    health: { employee: 0.03595, total: 0.0719 },
    ltc: { ofHealth: 0.139, ofWage: 0.009994 },
    employment: { employee: 0.009, total: 0.018 },
    minimumWage: { hourly: 10700, monthly: 2236300 }
  };

  var RATES = { '2026': RATES_2026, '2027': RATES_2027 };

  // 2026년 종합소득세율 (소득세법 제55조) — 간이세액표를 만들 때 쓰인 기준으로, 참고용입니다.
  var TAX_BRACKETS = [
    { limit: 14000000, rate: 0.06, deduction: 0 },
    { limit: 50000000, rate: 0.15, deduction: 1260000 },
    { limit: 88000000, rate: 0.24, deduction: 5760000 },
    { limit: 150000000, rate: 0.35, deduction: 15440000 },
    { limit: 300000000, rate: 0.38, deduction: 19940000 },
    { limit: 500000000, rate: 0.4, deduction: 25940000 },
    { limit: 1000000000, rate: 0.42, deduction: 35940000 },
    { limit: Infinity, rate: 0.45, deduction: 65940000 }
  ];

  var LIMITS = {
    monthlyHours: 209, // 주 40시간 기준 월 소정근로시간
    localTaxRate: 0.1 // 지방소득세 = 소득세의 10%
  };

  /* ------------------------------------------------------------------ *
   * 2. 공통 유틸
   * ------------------------------------------------------------------ */

  // 10원 미만 절사 (부동소수점 오차로 27,000원이 26,990원이 되는 것을 막기 위해 보정값 사용)
  function floor10(value) {
    return Math.floor(value / 10 + 1e-7) * 10;
  }

  function floorThousand(value) {
    return Math.floor(value / 1000) * 1000;
  }

  function clamp(value, lo, hi) {
    return Math.min(Math.max(value, lo), hi);
  }

  function toNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (!value) return 0;
    var n = Number(String(value).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  /* ------------------------------------------------------------------ *
   * 3. 4대보험료 (근로자 본인 부담분)
   * ------------------------------------------------------------------ */

  function insurance(monthlyTaxablePay, rates) {
    var r = rates || RATES_2026;
    var pay = Math.max(0, toNumber(monthlyTaxablePay));
    if (pay <= 0) {
      return { pensionBase: 0, pension: 0, health: 0, ltc: 0, employment: 0, total: 0 };
    }

    // 국민연금: 기준소득월액(천원 미만 절사)에 상·하한 적용
    var pensionBase = clamp(floorThousand(pay), r.pension.minBase, r.pension.maxBase);
    var pension = floor10(pensionBase * r.pension.employee);

    // 건강보험: 보수월액 기준
    var health = floor10(pay * r.health.employee);

    // 장기요양: 건강보험료 × 연도별 요율 (2026년 13.14%, 2027년 13.90%)
    var ltc = floor10(health * r.ltc.ofHealth);

    // 고용보험: 실업급여분 0.9%
    var employment = floor10(pay * r.employment.employee);

    return {
      pensionBase: pensionBase,
      pension: pension,
      health: health,
      ltc: ltc,
      employment: employment,
      total: pension + health + ltc + employment
    };
  }

  /* ------------------------------------------------------------------ *
   * 4. 근로소득세 (국세청 근로소득 간이세액표)
   *
   * 월 소득세 = 간이세액표의 공제대상가족수별 금액 − 8세 이상 20세 이하 자녀 수별 금액
   * 표의 공제대상가족수에는 본인과 배우자가 각각 1명씩 들어가므로, 화면의
   * 「부양가족 수(본인 제외)」+ 1이 표에서 찾을 칸이 됩니다.
   * ------------------------------------------------------------------ */

  function requireTable() {
    if (!LTC || typeof LTC.baseTax !== 'function') {
      throw new Error('근로소득 간이세액표(assets/ltc-2026.js)를 먼저 불러와야 합니다.');
    }
    return LTC;
  }

  /**
   * 표에서 찾을 공제대상가족수(본인 포함)
   * @param {number} dependents 본인을 제외한 부양가족 수
   */
  function familyCount(dependents) {
    return Math.max(1, Math.floor(toNumber(dependents)) + 1);
  }

  /**
   * 월 근로소득세와 지방소득세
   * @param {number} monthlyTaxable 비과세를 제외한 월급여액
   * @param {number} dependents 본인을 제외한 부양가족 수
   * @param {number} children 8세 이상 20세 이하 자녀 수
   */
  function incomeTax(monthlyTaxable, dependents, children) {
    var table = requireTable();
    var fam = familyCount(dependents);
    var kids = Math.max(0, Math.floor(toNumber(children)));
    var tableTax = table.baseTax(monthlyTaxable, fam);
    var childCreditMonthly = table.childCredit(kids);
    var tax = Math.max(0, tableTax - childCreditMonthly);
    return {
      familyCount: fam,
      children: kids,
      tableTax: tableTax,
      childCredit: childCreditMonthly,
      incomeTax: tax,
      localTax: floor10(tax * LIMITS.localTaxRate)
    };
  }

  /**
   * 월 실수령액 계산
   * @param {object} opts
   *  - monthlyGross: 세전 월 급여(비과세 포함)
   *  - nonTaxable: 월 비과세액(식대 등)
   *  - dependents: 부양가족 수(본인 제외)
   *  - children: 자녀세액공제 대상 자녀 수(8세 이상 20세 이하, 2026년 귀속)
   *  - rates: RATES_2026 / RATES_2027
   */
  function netPay(opts) {
    var o = opts || {};
    var rates = o.rates || RATES_2026;
    var monthlyGross = Math.max(0, toNumber(o.monthlyGross));
    var nonTaxable = clamp(toNumber(o.nonTaxable), 0, monthlyGross);
    var dependents = Math.max(0, Math.floor(toNumber(o.dependents)));
    var children = Math.max(0, Math.floor(toNumber(o.children)));

    var monthlyTaxable = monthlyGross - nonTaxable;
    var ins = insurance(monthlyTaxable, rates);
    var tax = incomeTax(monthlyTaxable, dependents, children);
    var taxIncome = tax.incomeTax;
    var taxLocal = tax.localTax;

    var totalDeduction = ins.total + taxIncome + taxLocal;

    return {
      ratesKey: rates.key,
      monthlyGross: monthlyGross,
      nonTaxable: nonTaxable,
      monthlyTaxable: monthlyTaxable,
      insurance: ins,
      incomeTax: taxIncome,
      localTax: taxLocal,
      totalDeduction: totalDeduction,
      netMonthly: monthlyGross - totalDeduction,
      netAnnual: (monthlyGross - totalDeduction) * 12,
      // 참고용 상세 (화면에는 쓰지 않고, 확인·검산용)
      tax: {
        familyCount: tax.familyCount,
        children: tax.children,
        tableTax: tax.tableTax,
        childCredit: tax.childCredit
      },
      annual: {
        tableTax: tax.tableTax * 12,
        childCredit: tax.childCredit * 12,
        incomeTax: taxIncome * 12,
        localTax: taxLocal * 12,
        totalTax: (taxIncome + taxLocal) * 12
      },
      deductionRate: monthlyGross > 0 ? totalDeduction / monthlyGross : 0
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. 퇴직금
   * ------------------------------------------------------------------ */

  function parseDate(value) {
    if (!value) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
    if (!m) return null;
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return isNaN(d.getTime()) ? null : d;
  }

  function addMonths(date, months) {
    var y = date.getUTCFullYear();
    var m = date.getUTCMonth() + months;
    var d = date.getUTCDate();
    var target = new Date(Date.UTC(y, m, 1));
    var lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)));
  }

  function diffDays(from, to) {
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  /**
   * 퇴직금 계산 (근로자퇴직급여보장법 제8조, 근로기준법 제2조)
   * @param {object} opts
   *  - startDate: 입사일 'YYYY-MM-DD'
   *  - endDate: 퇴직일(마지막 근무일의 다음 날)
   *  - monthlyWage: 최근 3개월 기준 월 임금 총액(세전, 기본급+정기수당)
   *  - annualBonus: 연간 상여금 총액
   *  - annualLeavePay: 연간 연차수당 총액
   */
  function severance(opts) {
    var o = opts || {};
    var start = parseDate(o.startDate);
    var end = parseDate(o.endDate);

    var result = {
      valid: false,
      reason: '',
      workDays: 0,
      workYears: 0,
      windowDays: 0,
      windowWage: 0,
      averageDailyWage: 0,
      severancePay: 0
    };

    if (!start || !end) {
      result.reason = '입사일과 퇴직일을 모두 입력해 주세요.';
      return result;
    }
    if (diffDays(start, end) <= 0) {
      result.reason = '퇴직일이 입사일보다 뒤여야 합니다.';
      return result;
    }

    var monthlyWage = Math.max(0, toNumber(o.monthlyWage));
    var annualBonus = Math.max(0, toNumber(o.annualBonus));
    var annualLeavePay = Math.max(0, toNumber(o.annualLeavePay));

    var workDays = diffDays(start, end);
    // 평균임금 산정기간: 퇴직일 전날부터 소급해 3개월
    var windowEnd = new Date(end.getTime() - 86400000);
    var windowStart = new Date(addMonths(windowEnd, -3).getTime() + 86400000);
    var windowDays = diffDays(windowStart, windowEnd) + 1;

    // 월 임금이 일정하다고 볼 때 3개월 임금총액 = 월 임금 × 3 (+ 상여·연차수당의 3/12)
    var windowWage = monthlyWage * 3 + annualBonus * (3 / 12) + annualLeavePay * (3 / 12);
    var averageDailyWage = windowDays > 0 ? windowWage / windowDays : 0;
    var severancePay = averageDailyWage * 30 * (workDays / 365);

    result.valid = true;
    result.workDays = workDays;
    result.workYears = workDays / 365;
    result.windowDays = windowDays;
    result.windowWage = windowWage;
    result.averageDailyWage = averageDailyWage;
    result.severancePay = Math.floor(severancePay);
    result.eligible = workDays >= 365;
    if (!result.eligible) {
      result.reason = '계속근로기간이 1년(365일) 미만이면 법정 퇴직금 지급 대상이 아닙니다.';
    }
    return result;
  }

  /* ------------------------------------------------------------------ *
   * 6. 연차 · 연차수당
   * ------------------------------------------------------------------ */

  function fullMonths(start, ref) {
    var months = (ref.getUTCFullYear() - start.getUTCFullYear()) * 12 + (ref.getUTCMonth() - start.getUTCMonth());
    if (ref.getUTCDate() < start.getUTCDate()) months -= 1;
    return Math.max(0, months);
  }

  /**
   * 연차 유급휴가 발생일수 (근로기준법 제60조, 입사일 기준)
   *  - 1년 미만: 1개월 개근 시 1일(최대 11일)
   *  - 1년 이상: 15일
   *  - 3년 이상: 최초 1년을 초과하는 계속근로연수 매 2년마다 1일 가산(최대 25일)
   */
  function leaveAccrual(startDate, refDate) {
    var start = parseDate(startDate);
    var ref = parseDate(refDate);
    if (!start || !ref || diffDays(start, ref) < 0) {
      return { valid: false, months: 0, years: 0, days: 0, shortTerm: false };
    }
    var months = fullMonths(start, ref);
    var years = Math.floor(months / 12);
    var days;
    if (years < 1) {
      days = Math.min(11, months);
      return { valid: true, months: months, years: months / 12, days: days, shortTerm: true };
    }
    days = 15 + (years >= 3 ? Math.floor((years - 1) / 2) : 0);
    days = Math.min(25, days);
    return { valid: true, months: months, years: years, days: days, shortTerm: false };
  }

  /**
   * 연차수당 계산
   * @param {object} opts
   *  - monthlyOrdinaryWage: 월 통상임금(세전)
   *  - unusedDays: 미사용 연차일수
   *  - hoursPerDay: 1일 소정근로시간(기본 8)
   */
  function annualLeavePay(opts) {
    var o = opts || {};
    var monthlyOrdinaryWage = Math.max(0, toNumber(o.monthlyOrdinaryWage));
    var unusedDays = Math.max(0, toNumber(o.unusedDays));
    var hoursPerDay = clamp(toNumber(o.hoursPerDay) || 8, 1, 24);
    // 통상시급은 원 단위로 반올림해 급여 담당자가 계산하는 방식과 맞춥니다.
    var hourlyWage = Math.round(monthlyOrdinaryWage / LIMITS.monthlyHours);
    var dailyWage = hourlyWage * hoursPerDay;
    var pay = Math.floor(dailyWage * unusedDays);
    return {
      hourlyWage: hourlyWage,
      dailyWage: dailyWage,
      unusedDays: unusedDays,
      hoursPerDay: hoursPerDay,
      pay: pay
    };
  }

  /* ------------------------------------------------------------------ *
   * 7. 연봉별 실수령액 표
   * ------------------------------------------------------------------ */

  function netPayTable(opts) {
    var o = opts || {};
    var rates = o.rates || RATES_2026;
    var rows = [];
    var list = o.salaries || [2400, 3000, 3600, 4200, 4800, 5400, 6000, 7000, 8000, 10000];
    for (var i = 0; i < list.length; i++) {
      var annualMan = list[i];
      var monthlyGross = Math.round((annualMan * 10000) / 12);
      var r = netPay({
        monthlyGross: monthlyGross,
        nonTaxable: o.nonTaxable,
        dependents: o.dependents,
        children: o.children,
        rates: rates
      });
      rows.push({
        annualMan: annualMan,
        monthlyGross: monthlyGross,
        insurance: r.insurance.total,
        tax: r.incomeTax + r.localTax,
        netMonthly: r.netMonthly,
        netAnnual: r.netAnnual
      });
    }
    return rows;
  }

  var Calc = {
    RATES: RATES,
    RATES_2026: RATES_2026,
    RATES_2027: RATES_2027,
    TAX_BRACKETS: TAX_BRACKETS,
    LIMITS: LIMITS,
    LTC: LTC,
    floor10: floor10,
    insurance: insurance,
    familyCount: familyCount,
    incomeTax: incomeTax,
    netPay: netPay,
    severance: severance,
    leaveAccrual: leaveAccrual,
    annualLeavePay: annualLeavePay,
    netPayTable: netPayTable
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  global.Calc = Calc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
