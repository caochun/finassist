/**
 * Content Script - 注入财务系统页面
 * 负责自动填入发票数据到表单字段
 */

// 默认字段映射配置（CSS选择器）
// 用户可在扩展设置中自定义这些映射
const DEFAULT_FIELD_MAPPING = {
  invoiceCode: '',
  invoiceNumber: '',
  invoiceDate: '',
  totalAmount: '',
  totalTax: '',
  totalWithTaxNumber: '',
  sellerName: '',
  sellerTaxId: '',
  buyerName: '',
  buyerTaxId: '',
  remark: ''
};

let fieldMapping = { ...DEFAULT_FIELD_MAPPING };

// 从存储中加载字段映射配置
chrome.storage.local.get('fieldMapping', (result) => {
  if (result.fieldMapping) {
    fieldMapping = { ...DEFAULT_FIELD_MAPPING, ...result.fieldMapping };
  }
});

// 监听来自 popup/background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FILL_FORM_DATA') {
    try {
      fillFormFields(message.data);
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ error: err.message });
    }
  }

  if (message.type === 'UPDATE_FIELD_MAPPING') {
    fieldMapping = { ...DEFAULT_FIELD_MAPPING, ...message.data };
    chrome.storage.local.set({ fieldMapping });
    sendResponse({ success: true });
  }

  if (message.type === 'GET_PAGE_INPUTS') {
    sendResponse({ inputs: detectPageInputs() });
  }
});

/**
 * 将发票数据填入页面表单
 */
function fillFormFields(invoiceData) {
  const flatData = flattenInvoiceData(invoiceData);
  let filledCount = 0;

  for (const [field, selector] of Object.entries(fieldMapping)) {
    if (!selector || !flatData[field]) continue;

    const element = document.querySelector(selector);
    if (!element) continue;

    setInputValue(element, flatData[field]);
    filledCount++;
  }

  return filledCount;
}

/**
 * 将嵌套的发票数据展平为单层对象
 */
function flattenInvoiceData(data) {
  return {
    invoiceCode: data.invoiceCode,
    invoiceNumber: data.invoiceNumber,
    invoiceDate: data.invoiceDate,
    checkCode: data.checkCode,
    totalAmount: data.totalAmount,
    totalTax: data.totalTax,
    totalWithTaxNumber: data.totalWithTaxNumber,
    remark: data.remark,
    sellerName: data.seller?.name,
    sellerTaxId: data.seller?.taxId,
    buyerName: data.buyer?.name,
    buyerTaxId: data.buyer?.taxId,
    itemName: data.items?.[0]?.name,
    itemAmount: data.items?.[0]?.amount
  };
}

/**
 * 设置输入框的值并触发相关事件
 * 兼容 React/Vue 等框架的受控组件
 */
function setInputValue(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (element.tagName === 'SELECT') {
    element.value = value;
  } else if (element.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
    nativeTextareaValueSetter.call(element, value);
  } else if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * 检测页面上的所有输入框，帮助用户配置字段映射
 */
function detectPageInputs() {
  const inputs = document.querySelectorAll('input, textarea, select');
  return Array.from(inputs).map((el, index) => {
    const label = findLabelForElement(el);
    return {
      index,
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
      label: label || '',
      selector: generateSelector(el)
    };
  }).filter(input => {
    // 过滤隐藏和不可见的输入框
    const el = document.querySelectorAll('input, textarea, select')[input.index];
    return el.offsetParent !== null && input.type !== 'hidden';
  });
}

/**
 * 查找与输入框关联的 label 文本
 */
function findLabelForElement(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }
  const parent = el.closest('label, .form-group, .form-item, tr, td');
  if (parent) {
    const label = parent.querySelector('label, .label, th');
    if (label && label !== el) return label.textContent.trim();
  }
  return '';
}

/**
 * 为元素生成唯一的 CSS 选择器
 */
function generateSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
  // 使用路径生成选择器
  const path = [];
  let current = el;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      path.unshift(`#${current.id}`);
      break;
    }
    const siblings = current.parentElement?.children;
    if (siblings && siblings.length > 1) {
      const index = Array.from(siblings).indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  return path.join(' > ');
}
