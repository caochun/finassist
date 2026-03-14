/**
 * 通义千问 (Qwen) DashScope API 调用封装
 */

const DASHSCOPE_API_URL = 'https://coding.dashscope.aliyuncs.com/v1/chat/completions';

/**
 * 调用 Qwen API
 * @param {string} apiKey - DashScope API Key
 * @param {string} prompt - 系统提示词
 * @param {string} content - 用户输入内容
 * @param {string} model - 模型名称
 * @returns {Promise<string>} 模型返回的文本
 */
export async function callQwen(apiKey, prompt, content, model = 'qwen-plus') {
  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qwen API 错误 (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
