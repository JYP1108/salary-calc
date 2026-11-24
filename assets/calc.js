/*!
 * 생활 계산소 - 계산 엔진 (calc.js)
 * 순수 함수만 담당합니다. DOM을 건드리지 않으므로 브라우저/테스트 양쪽에서 그대로 실행됩니다.
 *
 * 기준일: 2026년 11월 15일
 *  - 국민연금 9.5%(근로자 4.75%), 기준소득월액 하한 41만원·상한 659만원 (2026.7~2027.6)
 *  - 건강보험 7.19%(근로자 3.595%), 장기요양보험료 = 건강보험료 × 13.14%
 *  - 고용보험(실업급여) 1.8%(근로자 0.9%)
 *  - 소득세: 2026년 소득세법 세율·근로소득공제·인적공제·근로소득세액공제·자녀세액공제·표준세액공제
 *  - 2026년 최저임금 시급 10,320원(월 209시간 2,156,880원)
 */
(function (global) {
  'use strict';

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

  // 2027년: 국민연금 10%(근로자 5%)와 건강보험 7.19% 동결은 확정.
  // 장기요양·고용보험 요율은 2026년 11월 기준 미확정이므로 2026년 값을 그대로 사용합니다.
  var RATES_2027 = {
    key: '2027',
    label: '2027년(예정)',
    note: '국민연금 5.0%·건강보험 동결만 확정, 장기요양·고용보험은 2026년 요율로 가정',
    pension: { employee: 0.05, total: 0.1, minBase: 410000, maxBase: 6590000 },
    health: { employee: 0.03595, total: 0.0719 },
    ltc: { ofHealth: 0.1314, ofWage: 0.009448 },
    employment: { employee: 0.009, total: 0.018 },
    minimumWage: { hourly: 10700, monthly: 2236300 }
  };

  var RATES = { '2026': RATES_2026, '2027': RATES_2027 };

  // 2026년 종합소득세율 (소득세법 제55조)
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
    personalDeduction: 1500000, // 1인당 기본공제
    standardTaxCredit: 130000, // 표준세액공제(근로소득자)
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

    // 장기요양: 건강보험료의 13.14%
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
   * 4. 근로소득세 (간이세액표 방식 근사)
   * ------------------------------------------------------------------ */

  function workIncomeDeduction(grossAnnual) {
    var g = Math.max(0, grossAnnual);
    if (g <= 5000000) return g * 0.7;
    if (g <= 15000000) return 3500000 + (g - 5000000) * 0.4;
    if (g <= 45000000) return 7500000 + (g - 15000000) * 0.15;
    if (g <= 100000000) return 12000000 + (g - 45000000) * 0.05;
    return Math.min(14750000 + (g - 100000000) * 0.02, 20000000);
  }

  function progressiveTax(taxBase) {
    var base = Math.max(0, taxBase);
    if (base <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (base <= TAX_BRACKETS[i].limit) {
        return base * TAX_BRACKETS[i].rate - TAX_BRACKETS[i].deduction;
      }
    }
    return 0;
  }

  function workTaxCreditLimit(grossAnnual) {
    var g = grossAnnual;
    if (g <= 33000000) return 740000;
    if (g <= 70000000) return Math.max(660000, 740000 - (g - 33000000) * 0.008);
    if (g <= 120000000) return Math.max(500000, 660000 - (g - 70000000) * 0.5);
    return Math.max(200000, 500000 - (g - 120000000) * 0.5);
  }

  function workTaxCredit(calculatedTax, grossAnnual) {
    if (calculatedTax <= 0) return 0;
    var credit =
      calculatedTax <= 1300000 ? calculatedTax * 0.55 : 715000 + (calculatedTax - 1300000) * 0.3;
    return Math.min(credit, workTaxCreditLimit(grossAnnual));
  }

  // 자녀세액공제 (2026년: 1명 25만원, 2명 55만원, 3명 이상 55만원 + 2명 초과 1명당 40만원)
  function childTaxCredit(children) {
    var n = Math.max(0, Math.floor(toNumber(children)));
    if (n <= 0) return 0;
    if (n === 1) return 250000;
    if (n === 2) return 550000;
    return 550000 + (n - 2) * 400000;
  }

  /**
   * 월 실수령액 계산
   * @param {object} opts
   *  - monthlyGross: 세전 월 급여(비과세 포함)
   *  - nonTaxable: 월 비과세액(식대 등)
   *  - dependents: 부양가족 수(본인 제외)
   *  - children: 자녀세액공제 대상 자녀 수(2026년 귀속 9세 이상 20세 이하)
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

    var grossAnnual = monthlyTaxable * 12;
    var earnedIncome = Math.max(0, grossAnnual - workIncomeDeduction(grossAnnual));
    var personalDeduction = LIMITS.personalDeduction * (1 + dependents);
    // 간이세액표 방식: 국민연금(연금보험료)만 소득공제 반영, 건강보험료는 연말정산에서 공제
    var pensionDeduction = ins.pension * 12;
    var taxBase = Math.max(0, earnedIncome - personalDeduction - pensionDeduction);

    var calculatedTax = progressiveTax(taxBase);
    var creditWork = workTaxCredit(calculatedTax, grossAnnual);
    var creditChild = childTaxCredit(children);
    var creditStandard = LIMITS.standardTaxCredit;
    var determinedTax = Math.max(0, calculatedTax - creditWork - creditChild - creditStandard);

    var incomeTaxYear = determinedTax;
    var localTaxYear = determinedTax * LIMITS.localTaxRate;

    var incomeTax = floor10(incomeTaxYear / 12);
    var localTax = floor10(localTaxYear / 12);

    var totalDeduction = ins.total + incomeTax + localTax;

    return {
      ratesKey: rates.key,
      monthlyGross: monthlyGross,
      nonTaxable: nonTaxable,
      monthlyTaxable: monthlyTaxable,
      insurance: ins,
      incomeTax: incomeTax,
      localTax: localTax,
      totalDeduction: totalDeduction,
      netMonthly: monthlyGross - totalDeduction,
      netAnnual: (monthlyGross - totalDeduction) * 12,
      // 참고용 상세
      annual: {
        grossTaxable: grossAnnual,
        earnedIncome: earnedIncome,
        personalDeduction: personalDeduction,
        pensionDeduction: pensionDeduction,
        taxBase: taxBase,
        calculatedTax: calculatedTax,
        creditWork: creditWork,
        creditChild: creditChild,
        creditStandard: creditStandard,
        determinedTax: determinedTax,
        localTax: localTaxYear,
        totalTax: determinedTax + localTaxYear
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
    floor10: floor10,
    insurance: insurance,
    workIncomeDeduction: workIncomeDeduction,
    progressiveTax: progressiveTax,
    workTaxCredit: workTaxCredit,
    childTaxCredit: childTaxCredit,
    netPay: netPay,
    severance: severance,
    leaveAccrual: leaveAccrual,
    annualLeavePay: annualLeavePay,
    netPayTable: netPayTable
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  global.Calc = Calc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
