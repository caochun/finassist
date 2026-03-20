/**
 * Popup 主逻辑
 */

// PDF.js 本地路径
const PDF_JS_LOCAL = chrome.runtime.getURL('lib/pdf.min.mjs');
const PDF_JS_WORKER_LOCAL = chrome.runtime.getURL('lib/pdf.worker.min.mjs');

// DOM 元素
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('status');
const panelMain = document.getElementById('panel-main');
const panelSettings = document.getElementById('panel-settings');
const panelResult = document.getElementById('panel-result');
const invoiceTbody = document.getElementById('invoice-tbody');
const invoiceCount = document.getElementById('invoice-count');
const btnSettings = document.getElementById('btn-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnFill = document.getElementById('btn-fill');
const btnClear = document.getElementById('btn-clear');
const btnDetectInputs = document.getElementById('btn-detect-inputs');
const btnSaveMapping = document.getElementById('btn-save-mapping');
const fieldMappingList = document.getElementById('field-mapping-list');
const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');

// 发票列表数据: [{ fileName, data, project }]
let invoiceList = [];
// 页面项目选项: [{ project, subProject }]
let projectOptions = [];
let settingsVisible = true;

// 初始化：加载保存的设置
chrome.storage.local.get(['apiKey', 'model'], (result) => {
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey;
    settingsVisible = false;
    panelSettings.classList.add('hidden');
  }
  if (result.model) modelSelect.value = result.model;
});

// === 设置面板 ===
btnSettings.addEventListener('click', () => {
  settingsVisible = !settingsVisible;
  panelSettings.classList.toggle('hidden', !settingsVisible);
});

btnSaveSettings.addEventListener('click', () => {
  chrome.storage.local.set({
    apiKey: apiKeyInput.value,
    model: modelSelect.value
  });
  showStatus('设置已保存', 'success');
});

// === PDF 上传 ===
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
  if (files.length > 0) {
    processFiles(files);
  } else {
    showStatus('请上传 PDF 文件', 'error');
  }
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) processFiles(files);
});

// === 核心流程 ===
async function processFiles(files) {
  // 先尝试获取页面上的项目选项
  await fetchProjectOptions();
  console.log(`[财务助手] 获取到 ${projectOptions.length} 个项目选项`);

  const settings = await chrome.storage.local.get(['apiKey', 'model']);
  if (!settings.apiKey) {
    showStatus('请先在设置中配置 API Key', 'error');
    return;
  }

  let successCount = 0;
  for (const file of files) {
    showStatus(`正在解析 (${successCount + 1}/${files.length}): ${file.name} ...`, 'loading');
    try {
      const data = await processOneFile(file, settings);

      const autoProject = data.suggestedProject || '';
      invoiceList.push({ fileName: file.name, data, project: autoProject });
      successCount++;
    } catch (err) {
      showStatus(`${file.name} 解析失败: ${err.message}`, 'error');
    }
  }

  if (successCount > 0) {
    renderInvoiceTable();
    showStatus(`解析完成，共 ${successCount} 张发票`, 'success');
  }
}

async function processOneFile(file, settings) {
  const text = await extractPdfText(file);
  if (!text.trim()) {
    throw new Error('未提取到文本内容，可能是扫描件');
  }

  const invoiceData = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'EXTRACT_INVOICE', data: { apiKey: settings.apiKey, invoiceText: text, model: settings.model || 'qwen3.5-plus', projectOptions } },
      (response) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      }
    );
  });

  return invoiceData;
}

async function fetchProjectOptions() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: extractExpenseProjects
    });
    // 汇总所有 frame 的结果，取第一个有数据的
    for (const frame of results) {
      if (frame.result?.length) {
        projectOptions = frame.result;
        break;
      }
    }
  } catch {
    // 非财务系统页面或无权限，忽略
  }
}

// 注入到页面 frame 中执行的函数（独立作用域，不能引用外部变量）
function extractExpenseProjects() {
  const projects = [];

  // 直接通过 ID 查找数据表格
  let dataTable = document.getElementById('ctl00_ContentPlaceHolder1_GV_BXNR');

  // 备用：在"费用明细填写"附近查找 .datatable
  if (!dataTable) {
    const h5 = Array.from(document.querySelectorAll('h5')).find(
      el => el.textContent.includes('费用明细填写')
    );
    if (h5) {
      const container = h5.closest('td') || h5.closest('div');
      if (container) {
        // 数据表格是第二个 .datatable（第一个是表头）
        const tables = container.querySelectorAll('table.datatable');
        dataTable = tables.length > 1 ? tables[1] : tables[0];
      }
    }
  }

  if (!dataTable) return projects;

  // 遍历行，处理 rowspan 合并的项目列
  // 表格共 8 列：项目、子项目、关键字摘要、单据数、金额、描述、报销要点、明细
  // - 有 rowspan 的行：8 个 td，第一个是项目(跨行)，第二个是子项目
  // - rowspan 下的后续行：7 个 td，第一个是子项目（项目列被 rowspan 覆盖）
  // - 无 rowspan 的独立行：8 个 td，第一个是项目，第二个是子项目
  let currentProject = '';
  const rows = dataTable.querySelectorAll('tr.row');

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length === 0) continue;

    let subProjectCell;

    if (cells.length >= 8) {
      // 这一行包含项目列（有 rowspan 或独立行）
      currentProject = cells[0].textContent.trim();
      subProjectCell = cells[1];
    } else {
      // rowspan 覆盖的后续行，第一个 td 就是子项目
      subProjectCell = cells[0];
    }

    const subProject = subProjectCell ? subProjectCell.textContent.trim() : '';

    // 提取 ctl 编号（从该行任意 input 的 id 中提取）
    const input = row.querySelector('input[id*="_Txt_zy_real"]');
    const ctlMatch = input ? input.id.match(/(ctl\d+)_Txt_zy_real/) : null;
    const ctlId = ctlMatch ? ctlMatch[1] : '';

    if (currentProject) {
      projects.push({ project: currentProject, subProject, ctlId });
    }
  }

  return projects;
}

async function extractPdfText(file) {
  const pdfjsLib = await import(PDF_JS_LOCAL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_LOCAL;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    textParts.push(content.items.map(item => item.str).join(' '));
  }

  return textParts.join('\n');
}

// === 结果展示（表格） ===
const FIELD_LABELS = {
  invoiceType: '发票类型',
  invoiceCode: '发票代码',
  invoiceNumber: '发票号码',
  invoiceDate: '开票日期',
  checkCode: '校验码',
  totalAmount: '合计金额',
  totalTax: '合计税额',
  totalWithTaxNumber: '价税合计',
  remark: '备注',
  'seller.name': '销售方',
  'seller.taxId': '销售方税号',
  'buyer.name': '购买方',
  'buyer.taxId': '购买方税号'
};

function renderInvoiceTable() {
  panelResult.classList.remove('hidden');
  invoiceCount.textContent = invoiceList.length;
  invoiceTbody.innerHTML = '';

  invoiceList.forEach((item, index) => {
    const tr = document.createElement('tr');

    // 文件名
    const tdName = document.createElement('td');
    tdName.textContent = item.fileName;
    tdName.title = item.fileName;
    tdName.className = 'cell-filename';

    // 项目内容（发票上的商品/服务名称）
    const tdItems = document.createElement('td');
    const itemNames = Array.isArray(item.data.items)
      ? item.data.items.map(i => i.name).filter(Boolean).join('、')
      : '-';
    tdItems.textContent = itemNames || '-';
    tdItems.title = itemNames || '';
    tdItems.className = 'cell-items';

    // 销售方（兼容 seller 为对象或字符串）
    const tdSeller = document.createElement('td');
    const sellerName = typeof item.data.seller === 'string' ? item.data.seller : item.data.seller?.name || '-';
    tdSeller.textContent = sellerName;
    tdSeller.title = sellerName;
    tdSeller.className = 'cell-seller';

    // 日期
    const tdDate = document.createElement('td');
    tdDate.textContent = item.data.invoiceDate || '-';
    tdDate.className = 'cell-date';

    // 金额
    const tdAmount = document.createElement('td');
    tdAmount.textContent = item.data.totalWithTaxNumber ?? item.data.totalAmount ?? '-';
    tdAmount.className = 'cell-amount';

    // 项目下拉
    const tdProject = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'project-select';
    select.innerHTML = '<option value="">-- 选择项目 --</option>';
    for (const opt of projectOptions) {
      const label = opt.subProject ? `${opt.project} - ${opt.subProject}` : opt.project;
      select.innerHTML += `<option value="${label}">${label}</option>`;
    }
    // 匹配 suggestedProject 到下拉选项（先精确匹配，再去空格模糊匹配）
    if (item.project) {
      const options = Array.from(select.options);
      const exact = options.find(o => o.value === item.project);
      if (exact) {
      } else {
        const normalize = s => s.replace(/\s+/g, '');
        const fuzzy = options.find(o => o.value && normalize(o.value) === normalize(item.project));
        if (fuzzy) {
          item.project = fuzzy.value;
        } else {
        console.log(`[财务助手] 未匹配项目: "${item.project}"`);
        }
      }
    }
    select.value = item.project;
    select.addEventListener('change', () => {
      invoiceList[index].project = select.value;
    });
    tdProject.appendChild(select);

    // 删除按钮
    const tdAction = document.createElement('td');
    const btnDel = document.createElement('button');
    btnDel.className = 'btn-del';
    btnDel.textContent = 'x';
    btnDel.title = '移除';
    btnDel.addEventListener('click', () => {
      invoiceList.splice(index, 1);
      renderInvoiceTable();
    });
    tdAction.appendChild(btnDel);

    tr.appendChild(tdName);
    tr.appendChild(tdItems);
    tr.appendChild(tdSeller);
    tr.appendChild(tdDate);
    tr.appendChild(tdAmount);
    tr.appendChild(tdProject);
    tr.appendChild(tdAction);
    invoiceTbody.appendChild(tr);
  });
}

// === 填入表单 ===
btnFill.addEventListener('click', async () => {
  if (!invoiceList.length) return;

  // 过滤掉未选择项目的发票
  const assigned = invoiceList.filter(item => item.project);
  if (!assigned.length) {
    showStatus('请先为发票选择报销项目', 'error');
    return;
  }

  try {
    showStatus('正在生成摘要并填入表单...', 'loading');

    const settings = await chrome.storage.local.get(['apiKey', 'model']);

    // 1. 按项目分组汇总
    const grouped = {};
    for (const item of assigned) {
      if (!grouped[item.project]) {
        grouped[item.project] = { amount: 0, count: 0, itemNames: [] };
      }
      grouped[item.project].amount += (item.data.totalWithTaxNumber ?? item.data.totalAmount ?? 0);
      grouped[item.project].count += 1;
      // 收集商品名称
      if (Array.isArray(item.data.items)) {
        for (const i of item.data.items) {
          if (i.name) grouped[item.project].itemNames.push(i.name);
        }
      }
    }

    // 2. 一次 LLM 调用批量生成所有分组的摘要
    const projects = Object.keys(grouped);
    let summaryMap = {};
    if (settings.apiKey) {
      const batchInput = {};
      for (const project of projects) {
        if (grouped[project].itemNames.length > 0) {
          batchInput[project] = grouped[project].itemNames;
        }
      }
      if (Object.keys(batchInput).length > 0) {
        try {
          const result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
              { type: 'GENERATE_SUMMARY', data: { apiKey: settings.apiKey, batch: batchInput, model: settings.model || 'qwen3.5-plus' } },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else if (!response || response.error) {
                  reject(new Error(response?.error || '摘要生成无响应'));
                } else {
                  resolve(response);
                }
              }
            );
          });
          summaryMap = result.summaries || {};
        } catch {
          // 摘要生成失败时用商品名称截断
          for (const project of projects) {
            summaryMap[project] = grouped[project].itemNames.join('、').slice(0, 20);
          }
        }
      }
    }

    const fillData = [];
    for (const [project, group] of Object.entries(grouped)) {
      // 查找对应的 ctlId
      const opt = projectOptions.find(o => {
        const label = o.subProject ? `${o.project} - ${o.subProject}` : o.project;
        return label === project;
      });

      fillData.push({
        project,
        ctlId: opt?.ctlId || '',
        amount: Math.round(group.amount * 100) / 100,
        count: group.count,
        summary: summaryMap[project] || group.itemNames.join('、').slice(0, 20)
      });
    }

    // 3. 注入到页面 frame 中填入表单
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: fillExpenseTable,
      args: [fillData]
    });

    showStatus(`已填入 ${fillData.length} 个项目`, 'success');
  } catch (err) {
    showStatus(`填入失败: ${err.message}`, 'error');
  }
});

// 注入到页面 frame 中执行的填表函数
function fillExpenseTable(fillData) {
  const TABLE_ID = 'ctl00_ContentPlaceHolder1_GV_BXNR';
  const table = document.getElementById(TABLE_ID);
  if (!table) return;

  for (const item of fillData) {
    if (!item.ctlId) continue;

    const prefix = `${TABLE_ID}_${item.ctlId}`;
    const summaryInput = document.getElementById(`${prefix}_Txt_zy_real`);
    const countInput = document.getElementById(`${prefix}_Txt_fjzs`);
    const amountInput = document.getElementById(`${prefix}_Txt_Jje`);

    if (summaryInput) {
      summaryInput.value = item.summary;
      summaryInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (countInput) {
      countInput.value = String(item.count);
      countInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (amountInput) {
      amountInput.value = String(item.amount);
      amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

btnClear.addEventListener('click', () => {
  invoiceList = [];
  panelResult.classList.add('hidden');
  statusEl.classList.add('hidden');
  fileInput.value = '';
});

// === 字段映射 ===
btnDetectInputs.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INPUTS' });
    if (response?.inputs) {
      renderFieldMapping(response.inputs);
    }
  } catch (err) {
    showStatus('无法检测页面输入框，请确保在财务系统页面中', 'error');
  }
});

function renderFieldMapping(pageInputs) {
  fieldMappingList.innerHTML = '';
  btnSaveMapping.classList.remove('hidden');

  const invoiceFields = Object.entries(FIELD_LABELS);

  for (const [fieldKey, fieldLabel] of invoiceFields) {
    const row = document.createElement('div');
    row.className = 'mapping-row';

    const label = document.createElement('label');
    label.textContent = fieldLabel;

    const select = document.createElement('select');
    select.dataset.field = fieldKey;
    select.innerHTML = '<option value="">-- 不映射 --</option>';
    for (const input of pageInputs) {
      const desc = input.label || input.placeholder || input.name || input.id || `输入框${input.index}`;
      select.innerHTML += `<option value="${input.selector}">${desc}</option>`;
    }

    row.appendChild(label);
    row.appendChild(select);
    fieldMappingList.appendChild(row);
  }
}

btnSaveMapping.addEventListener('click', () => {
  const mapping = {};
  fieldMappingList.querySelectorAll('select').forEach(select => {
    if (select.value) {
      mapping[select.dataset.field] = select.value;
    }
  });

  chrome.storage.local.set({ fieldMapping: mapping });

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_FIELD_MAPPING', data: mapping });
  });

  showStatus('字段映射已保存', 'success');
});

// === 工具函数 ===
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove('hidden');
}
