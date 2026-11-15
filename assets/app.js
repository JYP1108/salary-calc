/*!
 * 생활 계산소 — 화면 동작 (app.js)
 * 계산은 calc.js(Calc)에 위임하고, 이 파일은 입력·표시만 담당합니다.
 */
(function () {
  'use strict';

  var C = window.Calc;
  if (!C) return;

  var nf = new Intl.NumberFormat('ko-KR');

  /* ---------------- 공통 유틸 ---------------- */

  function $(id) {
    return document.getElementById(id);
  }

  function won(value) {
    var n = Math.round(Number(value) || 0);
    return nf.format(n);
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value;
  }

  function num(el, fallback) {
    if (!el) return fallback || 0;
    var digits = String(el.value || '').replace(/[^0-9]/g, '');
    return digits ? Number(digits) : fallback === undefined ? 0 : fallback;
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /**
   * 금액 입력창에 천 단위 콤마를 입히고, 커서 위치를 유지합니다.
   * @param {HTMLInputElement} el
   * @param {number} maxDigits
   * @param {function(number):void} onChange
   */
  function bindMoneyInput(el, maxDigits, onChange) {
    if (!el) return;

    function format() {
      var raw = el.value || '';
      var caret = typeof el.selectionStart === 'number' ? el.selectionStart : raw.length;
      var digitsBefore = (raw.slice(0, caret).match(/[0-9]/g) || []).length;
      var digits = raw.replace(/[^0-9]/g, '').slice(0, maxDigits);
      var value = digits ? nf.format(Number(digits)) : '';
      el.value = value;

      if (document.activeElement === el) {
        var pos = 0;
        var seen = 0;
        if (digitsBefore > 0) {
          while (pos < value.length && seen < digitsBefore) {
            if (/[0-9]/.test(value.charAt(pos))) seen += 1;
            pos += 1;
          }
        }
        try {
          el.setSelectionRange(pos, pos);
        } catch (e) {
          /* date 등 selection 미지원 입력은 무시 */
        }
      }
      if (onChange) onChange(digits ? Number(digits) : 0);
    }

    el.addEventListener('input', format);
    el.addEventListener('blur', function () {
      if (el.value === '' || el.value === '0') el.value = '0';
    });
    return format;
  }

  /* ---------------- 탭 ---------------- */

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  function activateTab(name) {
    tabs.forEach(function (tab) {
      var on = tab.getAttribute('data-tab') === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      var panel = $(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () {
      activateTab(tab.getAttribute('data-tab'));
    });
    tab.addEventListener('keydown', function (event) {
      var next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        activateTab(next.getAttribute('data-tab'));
        next.focus();
      }
    });
  });

  /* ---------------- 1) 실수령액 ---------------- */

  var state = {
    mode: 'annual', // annual | monthly
    annualMan: 4800,
    monthlyMan: 400,
    nonTaxable: 200000,
    dependents: 0,
    children: 0,
    ratesKey: '2026'
  };

  var annualInput = $('annual-input');
  var annualRange = $('annual-range');
  var nontaxInput = $('nontax-input');
  var payLabel = $('pay-label');
  var payHint = $('pay-hint');

  function currentMonthlyGross() {
    var monthly = state.mode === 'annual' ? state.annualMan * 10000 / 12 : state.monthlyMan * 10000;
    return Math.round(monthly);
  }

  function renderNet() {
    var rates = C.RATES[state.ratesKey] || C.RATES_2026;
    var result = C.netPay({
      monthlyGross: currentMonthlyGross(),
      nonTaxable: state.nonTaxable,
      dependents: state.dependents,
      children: state.children,
      rates: rates
    });

    setText('net-pay', won(result.netMonthly));
    setText('net-pay-annual', won(result.netAnnual));
    setText('deduct-total', won(result.totalDeduction));
    setText('deduct-rate', (result.deductionRate * 100).toFixed(1));

    var ins = result.insurance;
    setText('ins-pension', won(ins.pension));
    setText('ins-health', won(ins.health));
    setText('ins-ltc', won(ins.ltc));
    setText('ins-employment', won(ins.employment));
    setText('ins-total', won(ins.total));
    setText('tax-income', won(result.incomeTax));
    setText('tax-local', won(result.localTax));

    var items = [
      ['bar-pension', ins.pension],
      ['bar-health', ins.health],
      ['bar-ltc', ins.ltc],
      ['bar-employment', ins.employment],
      ['bar-income', result.incomeTax],
      ['bar-local', result.localTax]
    ];
    var max = items.reduce(function (m, item) {
      return Math.max(m, item[1]);
    }, 1);
    items.forEach(function (item) {
      var bar = $(item[0]);
      if (bar) bar.style.width = Math.max(1.5, (item[1] / max) * 100).toFixed(1) + '%';
    });

    var note = $('net-note');
    if (note) {
      var pensionNote =
        ins.pensionBase > 0 && currentMonthlyGross() - state.nonTaxable > 6590000
          ? ' 국민연금은 기준소득월액 상한 659만원까지만 부과됩니다.'
          : '';
      note.innerHTML =
        '4대보험료 합계 <b id="ins-total">' + won(ins.total) + '</b>원 · 근로자 본인 부담분 기준' + pensionNote;
    }
  }

  function renderTable() {
    var rows = C.netPayTable({
      nonTaxable: state.nonTaxable,
      dependents: state.dependents,
      children: state.children,
      rates: C.RATES[state.ratesKey] || C.RATES_2026
    });
    var body = $('table-body');
    if (!body) return;
    body.innerHTML = rows
      .map(function (row) {
        return (
          '<tr>' +
          '<td>' + nf.format(row.annualMan) + '만원</td>' +
          '<td>' + won(row.monthlyGross) + '원</td>' +
          '<td>' + won(row.insurance) + '원</td>' +
          '<td>' + won(row.tax) + '원</td>' +
          '<td class="net">' + won(row.netMonthly) + '원</td>' +
          '<td>' + won(row.netAnnual) + '원</td>' +
          '</tr>'
        );
      })
      .join('');

    setText(
      'table-caption-people',
      '부양가족 ' + state.dependents + '명 · 자녀 ' + state.children + '명'
    );
    setText(
      'table-caption-nontax',
      state.nonTaxable ? nf.format(state.nonTaxable / 10000) + '만원' : '0원'
    );
  }

  function syncModeUI() {
    var isAnnual = state.mode === 'annual';
    if (payLabel) payLabel.textContent = isAnnual ? '연봉' : '월급';
    if (payHint) payHint.textContent = isAnnual ? '세전 기준 · 비과세 포함 금액' : '세전 기준 · 월 급여';
    if (annualInput) annualInput.value = nf.format(isAnnual ? state.annualMan : state.monthlyMan);
    if (annualRange) annualRange.hidden = !isAnnual;
    document.querySelectorAll('[data-pay-mode]').forEach(function (btn) {
      var on = btn.getAttribute('data-pay-mode') === state.mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  document.querySelectorAll('[data-pay-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = btn.getAttribute('data-pay-mode');
      if (next === state.mode) return;
      if (next === 'monthly') {
        state.monthlyMan = Math.round(state.annualMan / 12);
      } else {
        state.annualMan = state.monthlyMan * 12;
        if (annualRange) annualRange.value = Math.min(12000, Math.max(1800, state.annualMan));
      }
      state.mode = next;
      syncModeUI();
      renderNet();
    });
  });

  if (annualInput) {
    bindMoneyInput(annualInput, 6, function (value) {
      if (state.mode === 'annual') {
        state.annualMan = value;
        if (annualRange) annualRange.value = Math.min(12000, Math.max(1800, value));
      } else {
        state.monthlyMan = value;
      }
      renderNet();
    });
  }

  if (annualRange) {
    annualRange.addEventListener('input', function () {
      state.annualMan = Number(annualRange.value);
      if (state.mode === 'annual' && annualInput) annualInput.value = nf.format(state.annualMan);
      renderNet();
    });
  }

  if (nontaxInput) {
    bindMoneyInput(nontaxInput, 8, function (value) {
      state.nonTaxable = value;
      renderNet();
      renderTable();
    });
  }

  var dependentsSelect = $('dependents');
  if (dependentsSelect) {
    dependentsSelect.addEventListener('change', function () {
      state.dependents = Number(dependentsSelect.value);
      renderNet();
      renderTable();
    });
  }

  var childrenSelect = $('children');
  if (childrenSelect) {
    childrenSelect.addEventListener('change', function () {
      state.children = Number(childrenSelect.value);
      // 자녀는 부양가족에 포함되므로, 자녀 수가 부양가족 수보다 많으면 함께 올려 줍니다.
      if (state.children > state.dependents && dependentsSelect) {
        state.dependents = state.children;
        dependentsSelect.value = String(Math.min(6, state.dependents));
        state.dependents = Number(dependentsSelect.value);
      }
      renderNet();
      renderTable();
    });
  }

  var ratesSelect = $('rates-year');
  if (ratesSelect) {
    ratesSelect.addEventListener('change', function () {
      state.ratesKey = ratesSelect.value;
      var hint = $('rates-year-hint');
      var rates = C.RATES[state.ratesKey];
      if (hint && rates) hint.textContent = rates.note;
      if (annualRange) {
        annualRange.min = state.ratesKey === '2027' ? 2000 : 1800;
      }
      renderNet();
      renderTable();
    });
  }

  /* ---------------- 2) 퇴직금 ---------------- */

  var sevStart = $('sev-start');
  var sevEnd = $('sev-end');
  var sevWage = $('sev-wage');
  var sevBonus = $('sev-bonus');
  var sevLeavePay = $('sev-leavepay');

  if (sevEnd && !sevEnd.value) sevEnd.value = todayISO();

  function renderSeverance() {
    var result = C.severance({
      startDate: sevStart ? sevStart.value : '',
      endDate: sevEnd ? sevEnd.value : '',
      monthlyWage: num(sevWage),
      annualBonus: num(sevBonus),
      annualLeavePay: num(sevLeavePay)
    });

    setText('sev-result', result.valid ? won(result.severancePay) : '0');
    setText('sev-avg', result.valid ? won(Math.round(result.averageDailyWage)) : '0');
    setText('sev-days', result.valid ? nf.format(result.workDays) : '0');
    setText('sev-years', result.valid ? (result.workDays / 365).toFixed(2) : '0');
    setText('sev-window', result.valid ? nf.format(result.windowDays) : '0');
    setText('sev-wagetotal', result.valid ? won(result.windowWage) : '0');

    var note = $('sev-note');
    if (!note) return;
    if (!result.valid) {
      note.textContent = result.reason || '입사일과 퇴직일을 입력해 주세요.';
    } else if (!result.eligible) {
      note.innerHTML =
        '계속근로기간이 <b>1년 미만</b>(365일 미만)이라 법정 퇴직금 지급 대상이 아닙니다. ' +
        '그래도 참고 금액은 위와 같습니다.';
    } else {
      note.innerHTML =
        '1일 평균임금 <b>' + won(Math.round(result.averageDailyWage)) + '</b>원 × 30일 × ' +
        '(' + nf.format(result.workDays) + '일 ÷ 365) = <b>' + won(result.severancePay) + '</b>원';
    }
  }

  [sevStart, sevEnd, sevWage, sevBonus, sevLeavePay].forEach(function (el) {
    if (!el) return;
    if (el.type === 'text') {
      bindMoneyInput(el, 9, renderSeverance);
    } else {
      el.addEventListener('change', renderSeverance);
      el.addEventListener('input', renderSeverance);
    }
  });

  /* ---------------- 3) 연차수당 ---------------- */

  var lvStart = $('lv-start');
  var lvRef = $('lv-ref');
  var lvWage = $('lv-wage');
  var lvHours = $('lv-hours');
  var lvUsed = $('lv-used');
  var lvAccrued = $('lv-accrued');
  var accruedManual = false;

  if (lvRef && !lvRef.value) lvRef.value = todayISO();

  function autoAccrued() {
    if (accruedManual || !lvAccrued) return;
    var accrual = C.leaveAccrual(lvStart ? lvStart.value : '', lvRef ? lvRef.value : '');
    if (!accrual.valid) return;
    lvAccrued.value = String(accrual.days);
    var hint = $('lv-accrued-hint');
    if (hint) {
      hint.textContent = accrual.shortTerm
        ? '1년 미만 · 1개월 개근 시 1일(최대 11일) 기준으로 계산했습니다.'
        : '근속 ' + accrual.years + '년 · 입사일 기준 자동 계산값이며 직접 수정할 수 있습니다.';
    }
  }

  function renderLeave() {
    var accrued = num(lvAccrued);
    var used = num(lvUsed);
    var unused = Math.max(0, accrued - used);
    var result = C.annualLeavePay({
      monthlyOrdinaryWage: num(lvWage),
      unusedDays: unused,
      hoursPerDay: lvHours ? Number(lvHours.value) : 8
    });

    setText('lv-result', won(result.pay));
    setText('lv-unused', String(unused));
    setText('lv-hourly', won(Math.round(result.hourlyWage)));
    setText('lv-daily', won(Math.round(result.dailyWage)));
    setText('lv-accrued-out', String(accrued));
    setText('lv-used-out', String(used));
    setText('lv-unused-out', String(unused));

    var note = $('lv-note');
    if (note) {
      note.innerHTML =
        '통상시급 <b>' + won(Math.round(result.hourlyWage)) + '</b>원 × ' +
        result.hoursPerDay + '시간 × ' + unused + '일 = <b>' + won(result.pay) + '</b>원' +
        (unused === 0 ? ' · 미사용 연차가 없습니다.' : '');
    }
  }

  if (lvStart) {
    lvStart.addEventListener('change', function () {
      accruedManual = false;
      autoAccrued();
      renderLeave();
    });
  }
  if (lvRef) {
    lvRef.addEventListener('change', function () {
      accruedManual = false;
      autoAccrued();
      renderLeave();
    });
  }
  if (lvAccrued) {
    bindMoneyInput(lvAccrued, 2, function () {
      accruedManual = true;
      renderLeave();
    });
  }
  if (lvUsed) {
    bindMoneyInput(lvUsed, 2, renderLeave);
  }
  if (lvWage) {
    bindMoneyInput(lvWage, 9, renderLeave);
  }
  if (lvHours) {
    lvHours.addEventListener('change', renderLeave);
  }

  /* ---------------- 초기화 ---------------- */

  syncModeUI();
  renderNet();
  renderTable();
  autoAccrued();
  renderSeverance();
  renderLeave();
})();
