/**
 * 发票信息提取模块
 * 使用 Qwen API 从 PDF 文本中提取结构化发票信息
 */

import { callQwen } from './qwen-api.js';

const INVOICE_EXTRACTION_PROMPT = `你是一个专业的发票信息提取助手。请从用户提供的发票文本中提取以下信息，以JSON格式返回。

请严格按照以下JSON结构返回：
{
  "invoiceType": "发票类型（增值税普通发票/增值税专用发票/增值税电子普通发票/增值税电子专用发票/火车票/机票行程单/出租车票/过路费发票/其他）",
  "invoiceCode": "发票代码",
  "invoiceNumber": "发票号码",
  "invoiceDate": "开票日期（格式：YYYY-MM-DD）",
  "checkCode": "校验码（后6位）",
  "buyer": {
    "name": "购买方名称",
    "taxId": "购买方纳税人识别号",
    "address": "购买方地址电话",
    "bank": "购买方开户行及账号"
  },
  "seller": {
    "name": "销售方名称",
    "taxId": "销售方纳税人识别号",
    "address": "销售方地址电话",
    "bank": "销售方开户行及账号"
  },
  "items": [
    {
      "name": "货物或应税劳务名称",
      "specification": "规格型号",
      "unit": "单位",
      "quantity": "数量",
      "unitPrice": "单价",
      "amount": "金额",
      "taxRate": "税率",
      "tax": "税额"
    }
  ],
  "totalAmount": "合计金额（不含税）",
  "totalTax": "合计税额",
  "totalWithTax": "价税合计（大写）",
  "totalWithTaxNumber": "价税合计（小写数字）",
  "remark": "备注",
  "payee": "收款人",
  "reviewer": "复核",
  "drawer": "开票人",
  "trainInfo": {
    "passengerName": "乘车人",
    "idNumber": "身份证号",
    "departure": "出发站",
    "arrival": "到达站",
    "date": "乘车日期",
    "trainNumber": "车次",
    "seatType": "席别",
    "amount": "票价"
  },
  "flightInfo": {
    "passengerName": "旅客姓名",
    "idNumber": "有效身份证件号码",
    "eTicketNumber": "电子客票号码",
    "departure": "出发站",
    "arrival": "到达站",
    "date": "航班日期",
    "flightNumber": "航班号",
    "seatClass": "舱位等级",
    "amount": "票价",
    "fuelSurcharge": "燃油附加费",
    "insuranceFee": "保险费",
    "totalAmount": "合计"
  }
}

注意事项：
1. 如果某个字段在发票中不存在，设为 null
2. 火车票和机票填写对应的 trainInfo/flightInfo 字段
3. 金额字段统一使用数字（不含货币符号）
4. 日期统一使用 YYYY-MM-DD 格式
5. 仅返回JSON，不要添加其他说明文字`;

/**
 * 从发票文本中提取结构化信息
 * @param {string} apiKey - Qwen API Key
 * @param {string} invoiceText - 发票文本内容
 * @returns {Promise<object>} 结构化发票信息
 */
export async function extractInvoiceInfo(apiKey, invoiceText) {
  const result = await callQwen(apiKey, INVOICE_EXTRACTION_PROMPT, invoiceText);
  return JSON.parse(result);
}
