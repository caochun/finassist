/**
 * Service Worker - 消息协调中心
 * 处理 popup 和 content script 之间的通信
 */

// Service Worker 不支持 ES module import，使用 importScripts 的替代方案
// 在 Manifest V3 中通过消息传递实现模块间通信

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_INVOICE') {
    handleExtractInvoice(message.data).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // 保持消息通道开放（异步响应）
  }

  if (message.type === 'FILL_FORM') {
    handleFillForm(message.data, message.tabId).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }
});

async function handleExtractInvoice({ apiKey, invoiceText }) {
  const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  const PROMPT = `你是一个专业的发票信息提取助手。请从用户提供的发票文本中提取结构化信息，以JSON格式返回。

请严格按照以下JSON结构返回：
{
  "invoiceType": "发票类型",
  "invoiceCode": "发票代码",
  "invoiceNumber": "发票号码",
  "invoiceDate": "开票日期（YYYY-MM-DD）",
  "checkCode": "校验码（后6位）",
  "buyer": { "name": "", "taxId": "" },
  "seller": { "name": "", "taxId": "" },
  "items": [{ "name": "", "amount": "", "taxRate": "", "tax": "" }],
  "totalAmount": "合计金额",
  "totalTax": "合计税额",
  "totalWithTaxNumber": "价税合计数字",
  "remark": "备注"
}
不存在的字段设为null，金额用数字，日期用YYYY-MM-DD，仅返回JSON。`;

  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: invoiceText }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qwen API 错误 (${response.status}): ${error}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function handleFillForm(invoiceData, tabId) {
  await chrome.tabs.sendMessage(tabId, {
    type: 'FILL_FORM_DATA',
    data: invoiceData
  });
  return { success: true };
}
