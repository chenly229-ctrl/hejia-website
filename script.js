/**
 * 会议报价单生成器 — script.js
 * 上海和珈文化传媒有限公司
 */

document.addEventListener('DOMContentLoaded', function () {
  initCategoryToggle();
  initAttendeeSync();
  initItemRows();
  initCustomItems();
  recalculate();

  document.getElementById('export-btn').addEventListener('click', function () {
    exportToExcel().catch(function (err) {
      console.error('导出错误:', err);
      alert('导出失败：' + (err.message || String(err)));
    });
  });
});

/* ─────────────────────────────────────────────
   1. 分类折叠 / 展开
───────────────────────────────────────────── */
function initCategoryToggle() {
  document.querySelectorAll('.category-header').forEach(function (header) {
    header.addEventListener('click', function () {
      var targetId = header.getAttribute('data-target');
      var body = document.getElementById(targetId);
      var icon = header.querySelector('.toggle-icon');
      if (!body) return;

      if (body.style.display === 'none') {
        body.style.display = '';
        if (icon) icon.textContent = '▼';
      } else {
        body.style.display = 'none';
        if (icon) icon.textContent = '▲';
      }
    });
  });
}

/* ─────────────────────────────────────────────
   2. 基本信息联动（人数 / 半天数）
───────────────────────────────────────────── */
function initAttendeeSync() {
  var attendeesInput = document.getElementById('attendees');
  var halfDaysInput = document.getElementById('half-days');

  function syncQty() {
    var attendees = parseFloat(attendeesInput.value) || 0;
    var halfDays = parseFloat(halfDaysInput.value) || 0;

    document.querySelectorAll('.item-row').forEach(function (row) {
      var qtyType = row.getAttribute('data-qty-type');
      var qtyInput = row.querySelector('.item-qty');
      if (!qtyInput) return;

      if (qtyType === 'attendees') {
        qtyInput.value = attendees;
      } else if (qtyType === 'half-days') {
        qtyInput.value = halfDays;
      }
      // fixed / user / user-area / attendees-pages / hours: 不受联动影响
    });

    recalculate();
  }

  attendeesInput.addEventListener('input', syncQty);
  halfDaysInput.addEventListener('input', syncQty);

  // 初始化同步一次
  syncQty();
}

/* ─────────────────────────────────────────────
   3. 勾选项目行交互
───────────────────────────────────────────── */
function initItemRows() {
  document.querySelectorAll('.item-row').forEach(function (row) {
    var checkbox = row.querySelector('.item-check');
    var priceInput = row.querySelector('.item-price');
    var qtyInput = row.querySelector('.item-qty');

    if (!checkbox) return;

    // 勾选 / 取消勾选
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) {
        row.classList.add('checked');
        if (priceInput) priceInput.removeAttribute('readonly');
        if (qtyInput) qtyInput.removeAttribute('readonly');
      } else {
        row.classList.remove('checked');
        if (priceInput) priceInput.setAttribute('readonly', true);
        if (qtyInput) qtyInput.setAttribute('readonly', true);
        var totalEl = row.querySelector('.item-total');
        if (totalEl) totalEl.textContent = '¥0.00';
      }
      recalculate();
    });

    // 价格 / 数量变化时重算
    if (priceInput) priceInput.addEventListener('input', recalculate);
    if (qtyInput) qtyInput.addEventListener('input', recalculate);
  });

  // 税费 / 折扣变化
  document.getElementById('tax-select').addEventListener('change', recalculate);
  document.getElementById('discount-input').addEventListener('input', recalculate);
}

/* ─────────────────────────────────────────────
   4. 核心计算
───────────────────────────────────────────── */
function recalculate() {
  var attendees = parseFloat(document.getElementById('attendees').value) || 0;
  var grandSubtotal = 0;

  // ── 4a. 计算每个标准 item-row ──
  document.querySelectorAll('.item-row').forEach(function (row) {
    var checkbox = row.querySelector('.item-check');
    if (!checkbox || !checkbox.checked) return;

    var qtyType = row.getAttribute('data-qty-type');
    var price = parseFloat(row.querySelector('.item-price').value) || 0;
    var qty = parseFloat(row.querySelector('.item-qty').value) || 0;
    var total;

    if (qtyType === 'attendees-pages') {
      total = price * qty * attendees;
    } else {
      total = price * qty;
    }

    var totalEl = row.querySelector('.item-total');
    if (totalEl) totalEl.textContent = formatMoney(total);
    grandSubtotal += total;
  });

  // ── 4b. 计算各分类小计 ──
  document.querySelectorAll('.category-section').forEach(function (section) {
    var catSubtotalEl = section.querySelector('.cat-subtotal');
    if (!catSubtotalEl) return;

    var catTotal = 0;

    section.querySelectorAll('.item-row').forEach(function (row) {
      var checkbox = row.querySelector('.item-check');
      if (!checkbox || !checkbox.checked) return;
      var qtyType = row.getAttribute('data-qty-type');
      var price = parseFloat(row.querySelector('.item-price').value) || 0;
      var qty = parseFloat(row.querySelector('.item-qty').value) || 0;
      if (qtyType === 'attendees-pages') {
        catTotal += price * qty * attendees;
      } else {
        catTotal += price * qty;
      }
    });

    // 自定义行（仅在自定义分区）
    section.querySelectorAll('.custom-item-row').forEach(function (row) {
      var price = parseFloat(row.querySelector('.custom-price').value) || 0;
      var qty = parseFloat(row.querySelector('.custom-qty').value) || 0;
      catTotal += price * qty;
    });

    catSubtotalEl.textContent = formatMoney(catTotal);
  });

  // ── 4c. 自定义项目小计（并累加到 grandSubtotal） ──
  document.querySelectorAll('.custom-item-row').forEach(function (row) {
    var price = parseFloat(row.querySelector('.custom-price').value) || 0;
    var qty = parseFloat(row.querySelector('.custom-qty').value) || 0;
    var rowTotal = price * qty;
    var totalEl = row.querySelector('.custom-total');
    if (totalEl) totalEl.textContent = formatMoney(rowTotal);
    grandSubtotal += rowTotal;
  });

  // ── 4d. 汇总面板 ──
  document.getElementById('subtotal-amount').textContent = formatMoney(grandSubtotal);

  var taxRate = parseFloat(document.getElementById('tax-select').value) || 0;
  var discount = parseFloat(document.getElementById('discount-input').value) || 0;
  var grandTotal = grandSubtotal * (1 + taxRate) - discount;
  if (grandTotal < 0) grandTotal = 0;

  document.getElementById('grand-total-amount').textContent = formatMoney(grandTotal);

  updateSummaryPanel();
}

/* ─────────────────────────────────────────────
   5. 更新右侧汇总列表
───────────────────────────────────────────── */
function updateSummaryPanel() {
  var attendees = parseFloat(document.getElementById('attendees').value) || 0;
  var summaryList = document.getElementById('summary-list');
  var items = [];

  // 标准行
  document.querySelectorAll('.item-row').forEach(function (row) {
    var checkbox = row.querySelector('.item-check');
    if (!checkbox || !checkbox.checked) return;

    var qtyType = row.getAttribute('data-qty-type');
    var name = row.querySelector('.item-name').textContent.trim();
    var price = parseFloat(row.querySelector('.item-price').value) || 0;
    var qty = parseFloat(row.querySelector('.item-qty').value) || 0;
    var total;
    if (qtyType === 'attendees-pages') {
      total = price * qty * attendees;
    } else {
      total = price * qty;
    }
    items.push({ name: name, total: total });
  });

  // 自定义行
  document.querySelectorAll('.custom-item-row').forEach(function (row) {
    var name = row.querySelector('.custom-name').value.trim() || '（未命名项目）';
    var price = parseFloat(row.querySelector('.custom-price').value) || 0;
    var qty = parseFloat(row.querySelector('.custom-qty').value) || 0;
    var total = price * qty;
    items.push({ name: name, total: total });
  });

  if (items.length === 0) {
    summaryList.innerHTML = '<div class="summary-empty">尚未选择任何项目</div>';
    return;
  }

  var html = '';
  items.forEach(function (item) {
    html += '<div class="summary-item">'
      + '<span class="summary-item-name">' + escapeHtml(item.name) + '</span>'
      + '<span class="summary-item-amount">' + formatMoney(item.total) + '</span>'
      + '</div>';
  });
  summaryList.innerHTML = html;
}

/* ─────────────────────────────────────────────
   6. 自定义项目
───────────────────────────────────────────── */
function initCustomItems() {
  document.getElementById('add-custom-btn').addEventListener('click', function () {
    addCustomRow();
  });
}

function addCustomRow() {
  var container = document.getElementById('custom-items-container');
  var row = document.createElement('div');
  row.className = 'custom-item-row';
  row.innerHTML =
    '<input class="custom-name" type="text" placeholder="项目名称">' +
    '<input class="custom-desc" type="text" placeholder="产品描述（选填）">' +
    '<input class="custom-price" type="number" placeholder="单价" min="0" step="0.01">' +
    '<input class="custom-unit" type="text" placeholder="单位" value="次">' +
    '<input class="custom-qty" type="number" placeholder="数量" value="1" min="0">' +
    '<span class="custom-total">¥0.00</span>' +
    '<button class="custom-delete">✕</button>';

  container.appendChild(row);

  row.querySelector('.custom-price').addEventListener('input', recalculate);
  row.querySelector('.custom-qty').addEventListener('input', recalculate);
  row.querySelector('.custom-name').addEventListener('input', recalculate);
  row.querySelector('.custom-desc').addEventListener('input', recalculate);

  row.querySelector('.custom-delete').addEventListener('click', function () {
    container.removeChild(row);
    recalculate();
  });

  recalculate();
}

/* ─────────────────────────────────────────────
   7. Excel 导出（基于模板）
───────────────────────────────────────────── */

// 模板常量：数据行从第6行开始（1-indexed），模板有4个数据行
var TMPL_DATA_START = 6;   // 1-indexed
var TMPL_DATA_COUNT = 4;   // 模板原始数据行数

// 设置单元格值，保留原有样式（s 属性）
function setCell(ws, r, c, value, type, fmt) {
  var addr = XLSX.utils.encode_cell({ r: r, c: c });
  var existingS = ws[addr] ? ws[addr].s : undefined;
  ws[addr] = { t: type, v: value };
  if (existingS !== undefined) ws[addr].s = existingS;
  if (fmt) ws[addr].z = fmt;
}

// 把 srcRow 整行的样式复制到 dstRow（用于新增数据行）
// 无论源格子的样式是对象还是索引，都强制附加完整四边黑色细边框
function copyRowStyle(ws, srcR, dstR, maxCol) {
  var thin = { style: 'thin', color: { rgb: '000000' } };
  var fullBd = { top: thin, bottom: thin, left: thin, right: thin };

  for (var c = 0; c <= maxCol; c++) {
    var srcAddr = XLSX.utils.encode_cell({ r: srcR, c: c });
    var dstAddr = XLSX.utils.encode_cell({ r: dstR, c: c });
    var src = ws[srcAddr];

    if (!ws[dstAddr]) ws[dstAddr] = { t: 'z', v: '' };

    if (src && typeof src.s === 'object' && src.s !== null) {
      // 深拷贝样式对象，并覆盖 border 为完整四边框
      ws[dstAddr].s = {
        font:      src.s.font,
        fill:      src.s.fill,
        alignment: src.s.alignment,
        numFmt:    src.s.numFmt,
        border:    fullBd
      };
    } else {
      // 源样式是索引或不存在：仅带边框，后续由 applyAllStyles 完善其余样式
      ws[dstAddr].s = { border: fullBd };
    }
  }
}

// 将 startRow（1-indexed）及以下所有行向下移 count 行
function shiftRowsDown(ws, startRow, count) {
  var range = XLSX.utils.decode_range(ws['!ref']);
  var r0 = startRow - 1; // 转 0-indexed

  for (var r = range.e.r; r >= r0; r--) {
    for (var c = range.s.c; c <= range.e.c; c++) {
      var oldAddr = XLSX.utils.encode_cell({ r: r, c: c });
      var newAddr = XLSX.utils.encode_cell({ r: r + count, c: c });
      if (ws[oldAddr]) {
        ws[newAddr] = ws[oldAddr];
        delete ws[oldAddr];
      }
    }
  }

  range.e.r += count;
  ws['!ref'] = XLSX.utils.encode_range(range);

  if (ws['!merges']) {
    ws['!merges'] = ws['!merges'].map(function (m) {
      if (m.s.r >= r0) {
        return { s: { r: m.s.r + count, c: m.s.c }, e: { r: m.e.r + count, c: m.e.c } };
      }
      return m;
    });
  }

  if (ws['!rows']) {
    var newRows = [];
    for (var i = 0; i < ws['!rows'].length; i++) {
      if (i >= r0) {
        newRows[i + count] = ws['!rows'][i];
      } else {
        newRows[i] = ws['!rows'][i];
      }
    }
    ws['!rows'] = newRows;
  }
}

// 删除 startRow（1-indexed）起的 count 行，后续行上移
function deleteRows(ws, startRow, count) {
  var range = XLSX.utils.decode_range(ws['!ref']);
  var r0 = startRow - 1; // 0-indexed

  // 清空目标行
  for (var r = r0; r < r0 + count; r++) {
    for (var c = range.s.c; c <= range.e.c; c++) {
      delete ws[XLSX.utils.encode_cell({ r: r, c: c })];
    }
  }

  // 后续行上移
  for (var r = r0 + count; r <= range.e.r; r++) {
    for (var c = range.s.c; c <= range.e.c; c++) {
      var oldAddr = XLSX.utils.encode_cell({ r: r, c: c });
      var newAddr = XLSX.utils.encode_cell({ r: r - count, c: c });
      if (ws[oldAddr]) {
        ws[newAddr] = ws[oldAddr];
        delete ws[oldAddr];
      } else {
        delete ws[newAddr];
      }
    }
  }

  range.e.r -= count;
  ws['!ref'] = XLSX.utils.encode_range(range);

  if (ws['!merges']) {
    ws['!merges'] = ws['!merges'].filter(function (m) {
      return !(m.s.r >= r0 && m.s.r < r0 + count);
    }).map(function (m) {
      if (m.s.r >= r0 + count) {
        return { s: { r: m.s.r - count, c: m.s.c }, e: { r: m.e.r - count, c: m.e.c } };
      }
      return m;
    });
  }

  if (ws['!rows']) {
    var newRows = [];
    for (var i = 0; i < ws['!rows'].length; i++) {
      if (i >= r0 && i < r0 + count) continue;
      newRows[i >= r0 + count ? i - count : i] = ws['!rows'][i];
    }
    ws['!rows'] = newRows;
  }
}

async function exportToExcel() {
  var attendees = parseFloat(document.getElementById('attendees').value) || 0;
  var clientName = document.getElementById('client-name').value.trim();
  var meetingName = document.getElementById('meeting-name').value.trim();
  var meetingDate = document.getElementById('meeting-date').value || '';

  var fileName = (clientName || meetingName)
    ? (clientName || '') + '_' + (meetingName || '') + '_报价单.xlsx'
    : '报价单.xlsx';

  // ── 收集已选项目 ──
  var selectedItems = [];
  var seq = 1;

  document.querySelectorAll('.item-row').forEach(function (row) {
    var checkbox = row.querySelector('.item-check');
    if (!checkbox || !checkbox.checked) return;

    var qtyType = row.getAttribute('data-qty-type');
    var name = row.querySelector('.item-name').textContent.trim();
    var price = parseFloat(row.querySelector('.item-price').value) || 0;
    var qty = parseFloat(row.querySelector('.item-qty').value) || 0;
    var total = (qtyType === 'attendees-pages') ? price * qty * attendees : price * qty;
    var unitName = (row.querySelector('.item-unit-name') || {}).textContent || '';

    var exportPrice, exportQty, exportUnit;
    if (qtyType === 'attendees-pages') {
      // 单价列 = 元/页 × 页数，数量列 = 人数，单位 = 人
      exportPrice = price * qty;
      exportQty   = attendees;
      exportUnit  = '人';
    } else {
      exportPrice = price;
      exportQty   = qty;
      exportUnit  = unitName.trim();
    }

    selectedItems.push({ seq: seq++, name: name, desc: '', price: exportPrice, unit: exportUnit, qty: exportQty, total: total });
  });

  document.querySelectorAll('.custom-item-row').forEach(function (row) {
    var name = (row.querySelector('.custom-name').value || '').trim() || '（未命名项目）';
    var desc = (row.querySelector('.custom-desc').value || '').trim();
    var price = parseFloat(row.querySelector('.custom-price').value) || 0;
    var unit = (row.querySelector('.custom-unit').value || '次').trim();
    var qty = parseFloat(row.querySelector('.custom-qty').value) || 0;
    selectedItems.push({ seq: seq++, name: name, desc: desc, price: price, unit: unit, qty: qty, total: price * qty });
  });

  // ── 汇总计算 ──
  var subtotal = 0;
  selectedItems.forEach(function (item) { subtotal += item.total; });

  var taxRate = parseFloat(document.getElementById('tax-select').value) || 0;
  var discount = parseFloat(document.getElementById('discount-input').value) || 0;
  var taxAmount = subtotal * taxRate;
  var grandTotal = Math.max(0, subtotal + taxAmount - discount);
  var moneyFmt = '¥#,##0.00';

  // ── 加载模板（cellStyles:true 保留所有单元格颜色/字体/边框样式）──
  if (!window.TEMPLATE_B64) {
    alert('模板文件未加载，请确认 template-b64.js 已正确引入。');
    return;
  }
  var wb = XLSX.read(window.TEMPLATE_B64, { type: 'base64', cellStyles: true });
  var wsName = wb.SheetNames[0];
  var ws = wb.Sheets[wsName];

  // 各列宽度设置，wch + wpx 双设确保生效
  if (!ws['!cols']) ws['!cols'] = [];
  // 各列宽度设置
  ws['!cols'] = [
    { wch: 8  },  // A 序号
    { wch: 28 },  // B 产品名称
    { wch: 20 },  // C 产品描述
    { wch: 20 },  // D 产品描述合并列
    { wch: 26 },  // E 单价，加宽，避免 ######
    { wch: 10 },  // F 单位
    { wch: 10 },  // G 数量
    { wch: 22 }   // H 总价
  ];

  // ── 调整数据行数量 ──
  var N = selectedItems.length;
  if (N === 0) { alert('请至少选择一个项目后再导出。'); return; }

  if (N > TMPL_DATA_COUNT) {
    shiftRowsDown(ws, TMPL_DATA_START + TMPL_DATA_COUNT, N - TMPL_DATA_COUNT);
    var refR = TMPL_DATA_START - 1 + TMPL_DATA_COUNT - 1;
    var refHeight = ws['!rows'] && ws['!rows'][refR] ? ws['!rows'][refR] : null;
    if (!ws['!rows']) ws['!rows'] = [];
    for (var i = TMPL_DATA_COUNT; i < N; i++) {
      var newR = TMPL_DATA_START - 1 + i;
      copyRowStyle(ws, refR, newR, 7);
      if (refHeight) ws['!rows'][newR] = { hpt: refHeight.hpt, hpx: refHeight.hpx };
      ws['!merges'].push({ s: { r: newR, c: 2 }, e: { r: newR, c: 3 } });
    }
  } else if (N < TMPL_DATA_COUNT) {
    deleteRows(ws, TMPL_DATA_START + N, TMPL_DATA_COUNT - N);
  }

  // ── 填写客户信息（行2、3，0-indexed为1、2）──
  var contentText = meetingDate ? meetingDate + '  ' + meetingName : meetingName;
  setCell(ws, 1, 1, clientName, 's');
  setCell(ws, 2, 1, contentText, 's');

  // ── 填写数据行（setCell 会自动保留模板格子的样式）──
  selectedItems.forEach(function (item, i) {
    var r = TMPL_DATA_START - 1 + i; // 0-indexed
    setCell(ws, r, 0, item.seq, 'n');
    setCell(ws, r, 1, item.name, 's');
    setCell(ws, r, 2, item.desc, 's');
    setCell(ws, r, 4, item.price, 'n', moneyFmt);
    setCell(ws, r, 5, item.unit, 's');
    setCell(ws, r, 6, item.qty, 'n');
    setCell(ws, r, 7, item.total, 'n', moneyFmt);
  });

  // ── 填写汇总四行（小计/税率/折扣/总计）──
  // 汇总行紧接在最后一条数据行之后
  var sumR = TMPL_DATA_START - 1 + N; // 小计行（0-indexed）
  setCell(ws, sumR,     7, subtotal,   'n', moneyFmt);
  setCell(ws, sumR + 1, 7, taxAmount,  'n', moneyFmt);
  setCell(ws, sumR + 2, 7, discount,   'n', moneyFmt);
  setCell(ws, sumR + 3, 7, grandTotal, 'n', moneyFmt);

  // ── 应用全部样式 ──
  applyAllStyles(ws, N);

  // ── 生成 buffer，注入公章，下载 ──
  var outputArr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  var finalBuf  = await injectStamp(outputArr, N);
  var blob = new Blob([finalBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

/* ─────────────────────────────────────────────
   9. 公章注入（JSZip）
   从模板 ZIP 中复制 drawing + 图片到输出 ZIP，
   并按实际数据行数调整 drawing 锚点行号。
   模板锚点：from.row=14, to.row=19（0-indexed）
   每多/少 1 行，锚点整体 ±1。
───────────────────────────────────────────── */
async function injectStamp(outputArr, N) {
  if (typeof JSZip === 'undefined' || !window.TEMPLATE_B64) return outputArr;

  try {
    var tBytes = new Uint8Array(atob(window.TEMPLATE_B64).split('').map(function (c) { return c.charCodeAt(0); }));
    var results = await Promise.all([JSZip.loadAsync(tBytes), JSZip.loadAsync(outputArr)]);
    var tZip = results[0];
    var oZip = results[1];

    // 1. 复制图片（xl/media/）
    var paths = Object.keys(tZip.files);
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      if (p.startsWith('xl/media/') && !tZip.files[p].dir) {
        oZip.file(p, await tZip.file(p).async('uint8array'));
      }
    }

    // 2. 复制 drawing 关系文件
    var drawRelsFile = tZip.file('xl/drawings/_rels/drawing1.xml.rels');
    if (drawRelsFile) {
      oZip.file('xl/drawings/_rels/drawing1.xml.rels', await drawRelsFile.async('uint8array'));
    }

    // 3. 复制 drawing XML，并根据 N 调整锚点行号
    var drawFile = tZip.file('xl/drawings/drawing1.xml');
    if (drawFile) {
      var drawXml = await drawFile.async('string');
      var delta = N - 4; // TMPL_DATA_COUNT = 4
      if (delta !== 0) {
        drawXml = drawXml.replace(/<xdr:row>(\d+)<\/xdr:row>/g, function (m, row) {
          return '<xdr:row>' + (parseInt(row, 10) + delta) + '</xdr:row>';
        });
      }
      oZip.file('xl/drawings/drawing1.xml', drawXml);
    }

    // 4. 在 sheet1.xml 末尾加 <drawing r:id="rId1"/>（若缺失）
    var sheetXml = await oZip.file('xl/worksheets/sheet1.xml').async('string');
    if (sheetXml.indexOf('<drawing') === -1) {
      sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
      oZip.file('xl/worksheets/sheet1.xml', sheetXml);
    }

    // 5. 在 sheet1.xml.rels 中加 drawing 关系（若缺失）
    var relsPath = 'xl/worksheets/_rels/sheet1.xml.rels';
    var relsFile = oZip.file(relsPath);
    var relsXml  = relsFile
      ? await relsFile.async('string')
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    if (relsXml.indexOf('drawing') === -1) {
      var rel = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>';
      relsXml = relsXml.replace('</Relationships>', rel + '</Relationships>');
      oZip.file(relsPath, relsXml);
    }

    // 6. 在 [Content_Types].xml 中补充 drawing 和 png 类型（若缺失）
    var ctFile = oZip.file('[Content_Types].xml');
    if (ctFile) {
      var ctXml = await ctFile.async('string');
      var ctChanged = false;
      if (ctXml.indexOf('drawing+xml') === -1) {
        ctXml = ctXml.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
        ctChanged = true;
      }
      if (ctXml.indexOf('image/png') === -1) {
        ctXml = ctXml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
        ctChanged = true;
      }
      if (ctChanged) oZip.file('[Content_Types].xml', ctXml);
    }

    return await oZip.generateAsync({ type: 'arraybuffer' });
  } catch (e) {
    console.warn('公章注入失败，以无公章版本下载:', e);
    return outputArr;
  }
}

/* ─────────────────────────────────────────────
   8. 样式应用
   关键规则：合并单元格的边框只需设在左上角格子，
   内部格子用 isInnerMerge 跳过，避免干扰渲染。
───────────────────────────────────────────── */
function applyAllStyles(ws, N) {
  var BLUE   = '0070C0';
  var YELLOW = 'FFFF00';
  var BLACK  = '000000';
  var WHITE  = 'FFFFFF';
  var FONT   = 'Microsoft YaHei';
  var MONEY  = '¥#,##0.00';

  var thin = { style: 'thin', color: { rgb: BLACK } };
  var bd   = { top: thin, bottom: thin, left: thin, right: thin };

  function mk(bg, fg, sz, bold, align, numFmt) {
    var s = {
      font:      { name: FONT, sz: sz, bold: !!bold, color: { rgb: fg } },
      fill:      { patternType: 'solid', fgColor: { rgb: bg } },
      alignment: { horizontal: align, vertical: 'center', wrapText: true },
      border:    bd
    };
    if (numFmt) s.numFmt = numFmt;
    return s;
  }

  function cloneStyle(s) {
    return JSON.parse(JSON.stringify(s));
  }

  var S = {
    blueBoldLeft:  mk(BLUE,   BLACK, 11, true,  'left'),
    whiteBoldLeft: mk(WHITE,  BLACK, 11, true,  'left'),
    whiteBoldCtr:  mk(WHITE,  BLACK, 11, true,  'center'),
    dataCtr:       mk(WHITE,  BLACK, 11, false, 'center'),
    dataLeft:      mk(WHITE,  BLACK, 11, false, 'left'),
    dataMoney:     mk(WHITE,  BLACK, 11, false, 'center', MONEY),
    blankCtr:      mk(WHITE,  BLACK, 11, false, 'center'),
    yellBoldCtr:   mk(YELLOW, BLACK, 11, true,  'center'),
    yellBoldMoney: mk(YELLOW, BLACK, 11, true,  'center', MONEY),
    bankDetail:    mk(WHITE,  BLACK, 10, true,  'left')
  };

  // 设置单个格子的样式
  // 重点：不要用 t:'z'，改用 t:'s'，这样空白格子的边框也会被 Excel 写入
  function ap(r, c, s) {
    var addr = XLSX.utils.encode_cell({ r: r, c: c });

    if (!ws[addr]) {
      ws[addr] = { t: 's', v: '' };
    }

    if (ws[addr].t === 'z') {
      ws[addr].t = 's';
      ws[addr].v = '';
    }

    ws[addr].s = cloneStyle(s);
    delete ws[addr].z;
  }

  function apRow(r, s, c0, c1) {
    var start = c0 !== undefined ? c0 : 0;
    var end   = c1 !== undefined ? c1 : 7;
    for (var c = start; c <= end; c++) {
      ap(r, c, s);
    }
  }

  // 强制给一个区域补完整边框
  function forceBorder(r0, c0, r1, c1) {
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        var addr = XLSX.utils.encode_cell({ r: r, c: c });

        if (!ws[addr]) {
          ws[addr] = { t: 's', v: '' };
        }

        if (ws[addr].t === 'z') {
          ws[addr].t = 's';
          ws[addr].v = '';
        }

        if (!ws[addr].s) {
          ws[addr].s = {};
        }

        ws[addr].s.border = bd;
      }
    }
  }

  // ===== 顶部客户信息 =====
  apRow(0, S.blueBoldLeft, 0, 7);   // 客户信息
  apRow(1, S.whiteBoldLeft, 0, 7);  // 单位
  apRow(2, S.whiteBoldLeft, 0, 7);  // 内容

  // ===== 产品清单标题和表头 =====
  apRow(3, S.blueBoldLeft, 0, 7);   // 产品清单蓝色行
  apRow(4, S.whiteBoldCtr, 0, 7);   // 表头

  // ===== 数据行 =====
  for (var i = 0; i < N; i++) {
    var r = 5 + i;

    ap(r, 0, S.dataCtr);    // A 序号
    ap(r, 1, S.dataCtr);    // B 产品名称
    ap(r, 2, S.dataLeft);   // C 产品描述
    ap(r, 3, S.dataLeft);   // D 产品描述合并列
    ap(r, 4, S.dataMoney);  // E 单价
    ap(r, 5, S.dataCtr);    // F 单位
    ap(r, 6, S.dataCtr);    // G 数量
    ap(r, 7, S.dataMoney);  // H 总价
  }

  // ===== 小计 / 税费 / 折扣 / 总计 =====
  var sb = 5 + N;
  for (var j = 0; j < 4; j++) {
    var r2 = sb + j;

    // A:D 白色空白区域，也补边框
    apRow(r2, S.blankCtr, 0, 3);

    // E:G 黄色合并区域
    ap(r2, 4, S.yellBoldCtr);
    ap(r2, 5, S.yellBoldCtr);
    ap(r2, 6, S.yellBoldCtr);

    // H 金额
    ap(r2, 7, S.yellBoldMoney);
  }

  // ===== 银行账户信息区域 =====
  // 黄色汇总区结束后，下面就是银行账户信息
  var bankTitleRow = 9 + N;

  apRow(bankTitleRow, S.blueBoldLeft, 0, 7);

  for (var k = 0; k < 3; k++) {
    apRow(bankTitleRow + 1 + k, S.bankDetail, 0, 7);
  }

  // ===== 最后强制补齐边框 =====
  // 产品清单 + 表头 + 数据行 + 黄色汇总区
  forceBorder(3, 0, 8 + N, 7);

  // 银行账户信息区域
  forceBorder(bankTitleRow, 0, bankTitleRow + 3, 7);
}
/* ─────────────────────────────────────────────
   工具函数
───────────────────────────────────────────── */
function formatMoney(num) {
  if (isNaN(num)) num = 0;
  return '¥' + num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
