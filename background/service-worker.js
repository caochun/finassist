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

  if (message.type === 'GENERATE_SUMMARY') {
    handleGenerateSummary(message.data).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }
});

async function handleExtractInvoice({ apiKey, invoiceText, model = 'qwen3.5-plus', projectOptions = [] }) {
  const DASHSCOPE_API_URL = 'https://coding.dashscope.aliyuncs.com/v1/chat/completions';

  // 费用分类知识：各报销项目对应的典型发票内容（与财务系统"费用明细填写"表一致）
  const PROJECT_KNOWLEDGE = `以下是各报销项目的典型适用范围，供你判断发票应归入哪个项目时参考（格式为"项目 - 子项目"）：
办公费 - 办公用品：打印纸、硒鼓、墨盒、文具、笔、U盘、饮用水、名片印制等
办公费 - 书报杂志：报刊订阅费、期刊、杂志、图书、书籍购买
办公费 - 教材.资料费：教材、教学参考书、专业技术书籍、学术著作
办公费 - 其他：不属于上述办公费子项目的其他办公支出
市内交通费 - 业务用车租车费：公务租车
市内交通费 - 业务用车运行费：公务用车燃油费、维修费
市内交通费 - 市内交通费：出租车费、网约车费、地铁票、公交票、停车费
印刷费 - 印刷费：印刷、复印、打印服务
印刷费 - 出版费：论文版面费、审稿费、出版费、文献检索费
手续费 - 手续费：银行手续费、汇款手续费
水费 - 水费：水费
电费 - 校内电费：校内用电
电费 - 校外电费：校外用电
邮电费 - 邮寄费：快递费、邮寄费
邮电费 - 办公电话通讯费：办公电话费
邮电费 - 专业通讯费：专业通讯网络费
物业管理费 - 物业管理费：物业管理服务
物业管理费 - 绿化清洁费：绿化养护、保洁服务
物业管理费 - 保安服务费：安保服务
维修（护）费 - 专用设备维修费：专用设备维修
维修（护）费 - 一般设备维修费：电脑/打印机/空调等通用设备维修
维修（护）费 - 办公用房维修费：办公室装修、修缮
维修（护）费 - 公共基础设施维护费：公共设施维护
维修（护）费 - 网络信息系统运行与维护：服务器维护、软件运维、网络维护
维修（护）费 - 其它维修费：其他维修
租赁费 - 房屋租赁：房屋租金
租赁费 - 场地租赁：场地租金
租赁费 - 设备租赁：设备租赁费
租赁费 - 专用通讯网：专用通讯网络租赁
租赁费 - 其他：其他租赁
会议费 - 会议费：会议场地费、会议服务费
培训费 - 参加校外培训费支出：参加校外培训
培训费 - 校内举办培训费：校内举办培训、师资费、培训场地费
培训费 - 非学历教育培训：非学历教育培训
公务接待费 - 国内公务接待费：国内公务接待用餐、住宿
公务接待费 - 外宾接待费：外宾接待
专用材料费 - 实验材料及用品：实验耗材、试剂、实验用品
专用材料费 - 体育器材费：体育器材购置
专用材料费 - 低值仪器：单价低于固定资产标准的仪器设备、电子设备、存储卡、摄像头等
专用材料费 - 消防器材：消防器材购置
专用材料费 - 其他：其他专用材料
委托业务费 - 测试加工费：测试费、检测费、加工费
委托业务费 - 科研协作费：科研协作、技术服务费、委托研究费
委托业务费 - 数据采集费：数据采集、数据处理
委托业务费 - 办学协作费：办学协作
委托业务费 - 其他：其他委托业务
福利费 - 职工体检费：职工体检
福利费 - 职工福利费：员工福利
信息网络构建及软件购置更新 - 网络系统购置、开发等支出：网络系统购置、开发
信息网络构建及软件购置更新 - 软件购置、开发等支出：软件购买、软件开发服务
其他资本性支出 - 图书资料购置费：图书资料批量购置（大额）
其他资本性支出 - 其他：其他资本性支出
其他商品和服务支出 - 国内专家来访费：国内专家来访接待
其他商品和服务支出 - 国外专家来访费：国外专家来访接待
其他商品和服务支出 - 业务接待费：业务接待用餐（餐饮发票）
其他商品和服务支出 - 专利费用：专利申请费、专利代理费、专利年费
其他商品和服务支出 - 科研及专项业务支出：科研业务相关支出
其他商品和服务支出 - 学生实习实训费：学生实习实训
其他商品和服务支出 - 活动费：活动组织费用
其他商品和服务支出 - 其他租赁费：其他租赁
其他商品和服务支出 - 加班餐费：加班工作餐
其他商品和服务支出 - 其他：其他支出
公务用车 - 车辆使用运行费：车辆燃油、过路过桥费
公务用车 - 车辆维护费：车辆维修保养
公务用车 - 公务租车费：公务租车`;

  // 构建项目列表提示
  let projectHint = '';
  if (projectOptions.length > 0) {
    const optionList = projectOptions.map(o =>
      o.subProject ? `${o.project} - ${o.subProject}` : o.project
    ).join('\n');
    projectHint = `

${PROJECT_KNOWLEDGE}

请根据发票内容（商品名称、销售方行业等）和上述分类知识，从以下报销项目列表中选择最匹配的一个，填入"suggestedProject"字段（必须完全匹配列表中的某一项，格式为"项目 - 子项目"）：
${optionList}`;
  }

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
  "remark": "备注",
  "suggestedProject": "推荐的报销项目"
}
不存在的字段设为null，金额用数字，日期用YYYY-MM-DD，仅返回JSON。${projectHint}`;

  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
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

async function handleGenerateSummary({ apiKey, batch, model = 'qwen3.5-plus' }) {
  const DASHSCOPE_API_URL = 'https://coding.dashscope.aliyuncs.com/v1/chat/completions';

  // batch 格式: { "项目名": ["商品1", "商品2"], ... }
  const userContent = Object.entries(batch).map(([project, names]) =>
    `【${project}】\n${names.join('\n')}`
  ).join('\n\n');

  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `你是一个摘要助手。用户会提供按报销项目分组的发票商品名称列表。请为每个项目生成一个20字以内的关键字摘要，用于财务报销的费用说明。去掉税收分类前缀（如*印刷品*、*计算机外部设备*等）。
以JSON格式返回，key为项目名，value为摘要文本。仅返回JSON。` },
        { role: 'user', content: userContent }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qwen API 错误 (${response.status}): ${error}`);
  }

  const data = await response.json();
  const summaries = JSON.parse(data.choices[0].message.content);
  return { summaries };
}
