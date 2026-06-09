/**
 * 上海和珈文化传媒有限公司 — 官网聊天机器人核心逻辑
 * 纯前端实现，无需后端服务器或 API 密钥
 * 依赖：chatbot-qa.json（同目录），chatbot.css（同目录）
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // 常量与配置
  // ─────────────────────────────────────────────
  const COMPANY_PHONE = '135 8872 5432';
  const COMPANY_EMAIL = 'z62576258@163.com';
  const MATCH_THRESHOLD = 3;          // 加权匹配分数阈值（精确词+3，长短语+2，短词+1）
  const MAX_MISS_BEFORE_CONTACT = 3;  // 连续未匹配次数阈值
  const TYPING_SPEED_MS = 18;         // 打字效果每字符间隔（毫秒）

  // 触发报价流程的关键词
  const QUOTE_TRIGGER_WORDS = ['价格', '费用', '多少钱', '报价', '收费', '预算', '多少费', '价位', '报个价', '价钱'];

  const EVENT_TYPES = {
    ACADEMIC:   'academic',
    EXHIBITION: 'exhibition',
    ANNUAL:     'annual',
    LAUNCH:     'launch',
    OTHER:      'other'
  };

  // 物料别名映射（用于识别用户说的各种叫法）
  const ITEM_ALIASES = {
    brochure:         ['宣传册', '手册', '会议手册', '年会手册', '资料册', 'booklet', 'brochure'],
    exhibition_board: ['展览板', '展板', '展示板', 'KT板', 'poster board', 'display board'],
    table_cards:      ['席卡', '桌牌', '嘉宾姓名牌', 'name card', 'table card'],
    name_badges:      ['胸牌', '证件', '挂牌', 'badge'],
    catering:         ['茶歇', '餐饮', '咖啡', '点心', '饮料', '正餐', '用餐', '简餐', '午餐', '晚餐', '茶点'],
    photography:      ['摄影', '摄像', '拍照', '录像', '摄影摄像', '照片', '相片', '图片记录', '直播', '航拍'],
    interpretation:   ['同传', '翻译', '口译', '同声传译', '多语'],
    backdrop:         ['背景板', '背景墙', '主背景'],
    signage:          ['指示牌', '指引牌', '导向牌'],
    registration:     ['签到', '签到台', '签到物料'],
    agenda:           ['议程', '会议议程', '日程'],
    stage:            ['舞台', '舞台搭建'],
    led_screen:       ['大屏', 'LED', '投影'],
    lighting_audio:   ['灯光', '音响', '声响'],
    mc:               ['主持人', '司仪'],
    invitation:       ['邀请函', '请柬'],
    exhibition_booth: ['展台', '展位', '展区'],
    waste_disposal:   ['垃圾处理', '清洁', '清运', '垃圾'],
    souvenir:         ['纪念品', '礼品', '伴手礼', '小礼品', '定制礼品', '抽奖礼品', '奖品'],
  };

  // 物料类型匹配模式（用于过滤推荐列表中的已排除项，需与 ITEM_ALIASES 保持一致）
  const ITEM_PATTERNS = {
    brochure:         /宣传册|手册|年会手册|会议手册|资料册/,
    exhibition_board: /展览板|展板|展示板|KT板/,
    table_cards:      /席卡|桌牌|嘉宾姓名牌/,
    name_badges:      /胸牌|证件|挂牌/,
    catering:         /茶歇|餐饮|简餐|午餐|晚餐|茶点|咖啡|点心|用餐/,
    photography:      /摄影|摄像|拍照|录像|照片|相片/,
    interpretation:   /同传|翻译|口译|同声传译/,
    backdrop:         /背景板|背景墙|主背景|主视觉/,
    signage:          /指示牌|指引牌|导向牌/,
    registration:     /签到|签到台/,
    agenda:           /议程|日程/,
    stage:            /舞台/,
    led_screen:       /大屏|LED|投影/,
    lighting_audio:   /灯光|音响/,
    mc:               /主持人|司仪/,
    invitation:       /邀请函|请柬/,
    exhibition_booth: /展台|展位|展区/,
    waste_disposal:   /垃圾|清洁|清运/,
    souvenir:         /纪念品|礼品|伴手礼|小礼品|定制礼品|抽奖礼品/
  };

  // ─────────────────────────────────────────────
  // 状态变量
  // ─────────────────────────────────────────────
  let qaData = [];              // 从 JSON 加载的问答库
  let missCount = 0;            // 连续未匹配次数
  let quoteState = null;        // 报价流程状态（null 表示未启动）
  // quoteState = {
  //   data: {},          // 所有已收集的数据
  //   pendingQuestions: [{key, text}, ...],  // 待询问队列
  //   waitingKey: null   // 当前等待回答的 key
  // }
  let collectState = null;      // 信息收集状态（null 表示未启动）
  let lastQuoteContext = null; // 上一次报价的完整数据（用于修订）
  let lastPlanContext  = null; // 上一次预算推荐的上下文
  let budgetState      = null; // 预算推荐多轮状态（等待用户补充缺失字段）
  // budgetState = { data: { eventType, headcount, budget, duration }, waitingKey: 'headcount' }
  let pendingPlanAction = null; // 等待用户确认"加入/去掉"的待处理物料动作
  // pendingPlanAction = { contextType: 'plan', items: ['photography'], actionType: 'confirm_add_or_remove' }
  let pendingQuoteAction = null; // 等待用户确认报价中"加入/去掉"的待处理动作
  // pendingQuoteAction = { items: ['souvenir'], qty: 20 }
  let isOpen = false;           // 聊天窗口是否展开

  // ─────────────────────────────────────────────
  // DOM 构建
  // ─────────────────────────────────────────────

  /**
   * 创建并注入聊天机器人 DOM 结构
   */
  function buildDOM() {
    // 浮动按钮
    const btn = document.createElement('div');
    btn.id = 'hj-chat-btn';
    btn.innerHTML = '<span class="hj-btn-icon">&#128172;</span><span class="hj-btn-label">AI客服</span>';
    btn.title = 'AI客服在线咨询';

    // 聊天窗口
    const win = document.createElement('div');
    win.id = 'hj-chat-window';
    win.innerHTML = `
      <div id="hj-chat-header">
        <span id="hj-chat-title">和珈文化 · 在线咨询</span>
        <button id="hj-chat-close" title="关闭">&times;</button>
      </div>
      <div id="hj-messages"></div>
      <div id="hj-input-area">
        <input id="hj-input" type="text" placeholder="请输入您的问题…" autocomplete="off" />
        <button id="hj-send-btn">发送</button>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(win);
  }

  // ─────────────────────────────────────────────
  // 消息渲染
  // ─────────────────────────────────────────────

  /**
   * 向消息列表追加一条用户消息
   * @param {string} text
   */
  function appendUserMsg(text) {
    const list = document.getElementById('hj-messages');
    const div = document.createElement('div');
    div.className = 'hj-msg-user';
    div.textContent = text;
    list.appendChild(div);
    scrollToBottom();
  }

  /**
   * 向消息列表追加一条机器人消息（带打字效果）
   * @param {string} text
   * @param {Function} [onDone] 打字完成回调
   */
  function appendBotMsg(text, onDone) {
    const list = document.getElementById('hj-messages');
    const div = document.createElement('div');
    div.className = 'hj-msg-bot';
    list.appendChild(div);
    scrollToBottom();
    typeText(div, text, onDone);
  }

  /**
   * 打字机效果：逐字符渲染文本（支持换行符）
   * @param {HTMLElement} el
   * @param {string} text
   * @param {Function} [onDone]
   */
  function typeText(el, text, onDone) {
    let i = 0;
    // 将文本中 \n 替换为 <br> 标签，分段处理
    const parts = text.split('\n');
    let partIdx = 0;
    let charIdx = 0;

    function next() {
      if (partIdx >= parts.length) {
        if (onDone) onDone();
        return;
      }
      const part = parts[partIdx];
      if (charIdx < part.length) {
        el.innerHTML = buildInnerHTML(parts, partIdx, charIdx + 1);
        charIdx++;
        scrollToBottom();
        setTimeout(next, TYPING_SPEED_MS);
      } else {
        // 当前段落完毕，推进到下一段
        partIdx++;
        charIdx = 0;
        if (partIdx < parts.length) {
          el.innerHTML = buildInnerHTML(parts, partIdx, 0);
        }
        setTimeout(next, TYPING_SPEED_MS);
      }
    }

    /**
     * 根据当前进度构建 innerHTML（已完成段落 + 正在输入的段落）
     */
    function buildInnerHTML(parts, curPartIdx, curCharIdx) {
      let html = '';
      for (let p = 0; p < curPartIdx; p++) {
        html += escapeHtml(parts[p]) + '<br>';
      }
      html += escapeHtml(parts[curPartIdx].slice(0, curCharIdx));
      return html;
    }

    next();
  }

  /**
   * HTML 转义，防止 XSS
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 滚动消息列表到底部 */
  function scrollToBottom() {
    const list = document.getElementById('hj-messages');
    if (list) list.scrollTop = list.scrollHeight;
  }

  // ─────────────────────────────────────────────
  // 知识库加载
  // ─────────────────────────────────────────────

  /**
   * 异步加载 chatbot-qa.json
   * 支持相对路径（同目录）
   */
  function loadQA() {
    // 计算当前脚本所在目录，兼容不同引入方式
    const scriptSrc = (document.currentScript && document.currentScript.src) || '';
    const baseDir = scriptSrc ? scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1) : './';
    const jsonUrl = baseDir + 'chatbot-qa.json';

    return fetch(jsonUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('无法加载知识库：' + res.status);
        return res.json();
      })
      .then(function (data) {
        // 兼容顶层数组或 { qa: [...] } 两种格式
        qaData = Array.isArray(data) ? data : (data.qa || []);
      })
      .catch(function (err) {
        console.warn('[HJ Chatbot] 知识库加载失败，使用内置兜底。', err);
        qaData = [];
      });
  }

  // ─────────────────────────────────────────────
  // 关键词匹配
  // ─────────────────────────────────────────────

  /**
   * 对用户输入进行简单分词（按字符/标点切割，保留中文词组）
   * @param {string} text
   * @returns {string[]}
   */
  function tokenize(text) {
    // 转小写，去除常见标点
    const cleaned = text.toLowerCase().replace(/[，。？！、；：""''「」【】\s]/g, ' ');
    // 按空格切割并过滤空字符串
    const words = cleaned.split(' ').filter(Boolean);
    // 同时保留原始字符串本身作为候选，提高短语命中率
    words.push(cleaned.replace(/\s/g, ''));
    return words;
  }

  /**
   * 计算用户输入与单条 QA 的关键词匹配分数
   * @param {string[]} tokens  用户输入的分词结果
   * @param {string[]} keywords QA 条目的关键词数组
   * @returns {number} 匹配关键词数量
   */
  /**
   * 加权关键词匹配：精确 token +3，长短语（≥3字）包含 +2，短词包含 +1
   */
  function scoreMatch(tokens, keywords, inputStr) {
    if (!keywords || keywords.length === 0) return 0;
    let score = 0;
    const str = inputStr !== undefined ? inputStr : tokens.join('');
    keywords.forEach(function (kw) {
      const kwLower = kw.toLowerCase();
      if (tokens.indexOf(kwLower) !== -1) {
        score += 3;                          // 精确 token 匹配：最高权重
      } else if (str.indexOf(kwLower) !== -1) {
        score += kwLower.length >= 3 ? 2 : 1; // 短语含匹配：按长度定权
      }
    });
    return score;
  }

  /**
   * 在知识库中找到最佳匹配答案
   * @param {string} input     用户输入
   * @param {Object} [intentObj] detectIntent 的返回值（可选，提供意图加权）
   * @returns {string|null}
   */
  function findBestAnswer(input, intentObj) {
    if (qaData.length === 0) return null;
    const tokens  = tokenize(input);
    const inputStr = tokens.join('');
    let bestScore  = 0;
    let bestAnswer = null;

    qaData.forEach(function (item) {
      let score = scoreMatch(tokens, item.keywords, inputStr);

      // 意图加权：意图与 QA 分类吻合则加分
      if (intentObj) {
        if (intentObj.has('booking_time') && item.category === 'booking')         score += 3;
        if (intentObj.has('quotation')    && item.category === 'pricing')          score += 2;
        if (intentObj.has('photography')  && item.category === 'photography')      score += 2;
        if (intentObj.has('catering')     && item.category === 'catering')         score += 2;
        if (intentObj.has('academic_conference') &&
            /会议|论坛|峰会|研讨|学术/.test(item.keywords.join('')))               score += 2;
        if (intentObj.has('materials')    && item.category === 'services')         score += 1;
      }

      if (score > bestScore) {
        bestScore  = score;
        bestAnswer = item.answer;
      }
    });

    return bestScore >= MATCH_THRESHOLD ? bestAnswer : null;
  }

  // ─────────────────────────────────────────────
  // 报价流程 — 智能版
  // ─────────────────────────────────────────────

  /**
   * 检测用户输入中的活动类型
   * @param {string} input
   * @returns {string|null} EVENT_TYPES 中的值，或 null
   */
  function detectEventType(input) {
    if (/学术会议|论坛|研讨会|培训会议|峰会|conference|academic|seminar|forum/i.test(input)) {
      return EVENT_TYPES.ACADEMIC;
    }
    if (/展会|展览|展台|展厅|展览会/.test(input)) {
      return EVENT_TYPES.EXHIBITION;
    }
    if (/年会|颁奖|晚会|年终/.test(input)) {
      return EVENT_TYPES.ANNUAL;
    }
    if (/发布会|新品|产品发布|上市/.test(input)) {
      return EVENT_TYPES.LAUNCH;
    }
    return null;
  }

  /**
   * 检测用户输入中提到的物料/服务项目
   * @param {string} input
   * @returns {string[]} 识别到的物料键数组
   */
  function detectMentionedItems(input) {
    const items = [];
    // ── 印刷物料 ──
    if (/展览板|展板|展陈板|展示板|KT板|display board|poster board/i.test(input))  items.push('exhibition_board');
    if (/宣传册|手册|booklet|brochure|会议手册/i.test(input))                        items.push('brochure');
    if (/席卡|桌牌|table card/i.test(input))                                         items.push('table_cards');
    if (/胸牌|证件|名牌|badge/i.test(input))                                         items.push('name_badges');
    if (/议程|会议议程|agenda/i.test(input))                                          items.push('agenda');
    if (/指示牌|指引牌|signage/i.test(input))                                         items.push('signage');
    if (/邀请函|请柬|入场券|invitation/i.test(input))                                 items.push('invitation');
    // ── 现场服务 ──
    if (/签到|签到台|registration/i.test(input))                                      items.push('registration');
    if (/茶歇|餐饮|catering|咖啡|用餐|正餐/i.test(input))                            items.push('catering');
    if (/摄影|摄像|photography|拍照|录像|航拍|无人机|直播/i.test(input))              items.push('photography');
    if (/同传|翻译|口译|interpretation|多语|双语/i.test(input))                       items.push('interpretation');
    if (/主持人|司仪|MC|emcee/i.test(input))                                          items.push('mc');
    // ── 舞美搭建 ──
    if (/背景板|backdrop|背景墙/i.test(input))                                        items.push('backdrop');
    if (/展台|展位|展区|摊位|booth/i.test(input))                                     items.push('exhibition_booth');
    if (/舞台|stage/i.test(input))                                                    items.push('stage');
    if (/灯光|音响|声响|lighting|audio/i.test(input))                                 items.push('lighting_audio');
    if (/大屏|LED屏|投影仪|投影|屏幕|LED/i.test(input))                              items.push('led_screen');
    // ── 其他 ──
    if (/垃圾|清运|废弃物|waste/i.test(input))                                        items.push('waste_disposal');
    if (/纪念品|礼品|伴手礼|小礼品|定制礼品|抽奖礼品|奖品/i.test(input))            items.push('souvenir');
    return items;
  }

  /**
   * 从自然语言中提取人数和天数
   * @param {string} input
   * @returns {{ headcount: number|null, duration: number|null }}
   */
  function extractBasicInfo(input) {
    const info = { headcount: null, duration: null };
    const hcMatch = input.match(/(\d+)\s*(?:人|位|名)/);
    if (hcMatch) info.headcount = parseInt(hcMatch[1], 10);
    const dayMatch = input.match(/(\d+)\s*(?:天|日)/);
    if (dayMatch) info.duration = parseInt(dayMatch[1], 10);
    return info;
  }

  /**
   * 根据活动类型、已识别物料、已有数据，构建待询问队列
   * @param {string|null} eventType
   * @param {string[]} detectedItems
   * @param {Object} data
   * @returns {Array<{key: string, text: string}>}
   */
  function buildQuestionQueue(eventType, detectedItems, data) {
    const queue = [];

    // 基础信息（如缺失）
    if (!data.headcount) {
      queue.push({ key: 'headcount', text: '请问预计参与人数大约是多少人？（例如：100）' });
    }
    if (!data.duration) {
      queue.push({ key: 'duration', text: '活动时长大约几天？（例如：1）' });
    }
    if (eventType === null) {
      queue.push({
        key: '_eventTypeInput',
        text: '请问是哪种类型的活动？\n① 学术会议/论坛/研讨会  ② 展览展会  ③ 年会/颁奖  ④ 产品发布会  ⑤ 其他'
      });
    }

    // ── 展览板配套 ──
    if (detectedItems.indexOf('exhibition_board') !== -1) {
      if (!data['_exhibitionBoardCount']) {
        queue.push({ key: '_exhibitionBoardCount', text: '展览板大约需要几块？（例如：5块）' });
      }
      queue.push({
        key: '_exhibitionBoardDeps',
        text: '展览板通常还涉及设计、制作、运输、现场安装、撤场和垃圾处理。\n请问这些是否也需要我们负责？\n（回复"全部包含"，或说明需要哪几项，例如"只需要制作和安装"）'
      });
    }

    // ── 宣传册明细 ──
    if (detectedItems.indexOf('brochure') !== -1) {
      if (!data['_brochureDesign']) queue.push({ key: '_brochureDesign', text: '宣传册是否需要我们负责设计排版？（是 / 否）' });
      if (!data['_brochurePages'])  queue.push({ key: '_brochurePages',  text: '宣传册大约多少页？（例如：20页）' });
      if (!data['_brochureQty'])    queue.push({ key: '_brochureQty',    text: '需要印刷多少本？（例如：200本）' });
      if (!data['_brochureColor'])  queue.push({ key: '_brochureColor',  text: '宣传册是彩色还是黑白？（彩色 / 黑白）' });
    }

    // ── 邀请函 ──
    if (detectedItems.indexOf('invitation') !== -1) {
      queue.push({ key: '_invitationDesign', text: '邀请函是否需要设计？（是 / 否）' });
      if (!data['_invitationQty']) queue.push({ key: '_invitationQty', text: '邀请函需要印制多少份？（例如：200份）' });
    }

    // ── 同声传译配套 ──
    if (detectedItems.indexOf('interpretation') !== -1) {
      queue.push({ key: '_interpLanguages', text: '同传涉及几种语言？（例如：2种，中文和英文）' });
      queue.push({
        key: '_interpBooth',
        text: '是否需要提供同传箱（隔音箱）？通常每种语言配备一个同传箱。\n（是 / 否）'
      });
      queue.push({
        key: '_interpInterpreters',
        text: '是否需要我们提供同传口译员？（是 / 否，如客户自行安排请回复"否"）'
      });
    }

    // ── 摄影摄像配套 ──
    if (detectedItems.indexOf('photography') !== -1) {
      queue.push({
        key: '_photoServices',
        text: '需要哪些拍摄服务？（可多选）\n① 摄影（平面）\n② 摄像（视频）\n③ 航拍/无人机\n④ 现场直播\n⑤ 后期剪辑制作\n请告知需要的编号或名称'
      });
    }

    // ── 餐饮茶歇明细 ──
    if (detectedItems.indexOf('catering') !== -1) {
      queue.push({
        key: '_cateringType',
        text: '餐饮安排是茶歇还是正餐，还是两者都有？\n（茶歇 / 正餐 / 茶歇+正餐）'
      });
      queue.push({ key: '_cateringCount', text: '一共几次茶歇/餐食？（例如：上午1次茶歇，中午1次正餐）' });
    }

    // ── 背景板配套 ──
    if (detectedItems.indexOf('backdrop') !== -1) {
      queue.push({ key: '_backdropDesign', text: '背景板是否需要我们负责设计？（是 / 否）' });
      queue.push({ key: '_backdropSize',   text: '背景板大约多大？（例如：4米×2米；如不确定可回复"标准"）' });
      queue.push({ key: '_backdropLight',  text: '是否需要背景板灯光（如面光、射灯）？（是 / 否）' });
    }

    // ── 展台/展位搭建配套 ──
    if (detectedItems.indexOf('exhibition_booth') !== -1) {
      queue.push({ key: '_boothArea',   text: '展台/展位大约多少平方米？（例如：36平）' });
      queue.push({ key: '_boothDesign', text: '展台是否需要效果图设计？（是 / 否）' });
      queue.push({
        key: '_boothExtras',
        text: '展台通常还涉及灯光照明、展柜/展架、地毯、运输安装和撤场清运。\n请问这些是否也需要我们负责？\n（全部包含 / 说明需要哪几项 / 都不需要）'
      });
    }

    // ── 舞台搭建配套 ──
    if (detectedItems.indexOf('stage') !== -1) {
      queue.push({ key: '_stageSize', text: '舞台大约多大？（例如：8米×6米×0.8米）' });
      queue.push({
        key: '_stageExtras',
        text: '舞台通常还涉及灯光音响、LED大屏/背景屏、桁架结构。\n请问这些是否也需要我们负责？\n（全部包含 / 说明需要哪几项）'
      });
    }

    // ── 主持人 ──
    if (detectedItems.indexOf('mc') !== -1 && !data['_mcConfirmed']) {
      queue.push({
        key: '_mcLevel',
        text: '主持人有什么要求？\n① 公司级礼仪主持（基础）  ② 专业庆典主持人  ③ 知名主持/明星主持\n请告知编号或说明'
      });
    }

    // ── 灯光音响（独立提及） ──
    if (detectedItems.indexOf('lighting_audio') !== -1 && detectedItems.indexOf('stage') === -1) {
      queue.push({
        key: '_lightingScope',
        text: '灯光音响的使用场景是？\n① 会议室/小场地（基础扩音）\n② 大型会场（全套灯光音响）\n③ 户外活动\n请告知编号或说明'
      });
    }

    // ── LED大屏（独立提及） ──
    if (detectedItems.indexOf('led_screen') !== -1 && detectedItems.indexOf('stage') === -1) {
      queue.push({ key: '_ledSize', text: 'LED大屏/投影仪大约需要多大尺寸或几块屏幕？（例如：4米×2米大屏×1块）' });
    }

    // ── 纪念品/礼品 ──
    if (detectedItems.indexOf('souvenir') !== -1 && !data['_souvenirQty']) {
      queue.push({ key: '_souvenirQty', text: '纪念品/礼品大约需要多少份？如不确定，可直接输入数字，或回复"按人数"由我代为估算。' });
    }

    // ── 学术会议标配核查 ──
    if (eventType === EVENT_TYPES.ACADEMIC && !data['_academicExtras']) {
      queue.push({
        key: '_academicExtras',
        text: '学术会议通常还会需要：\n· 席卡（桌牌）\n· 嘉宾胸牌\n· 会议议程印制\n· 签到台物料\n· 现场指示牌\n\n请问这些是否需要包含在报价中？\n（全部需要 / 部分需要请说明 / 都不需要）'
      });
    }

    // ── 年会/颁奖晚会标配核查 ──
    if (eventType === EVENT_TYPES.ANNUAL && !data['_annualExtras']) {
      queue.push({
        key: '_annualExtras',
        text: '年会/颁奖晚会通常还需要：\n· 舞台搭建与灯光音响\n· 主持人/司仪\n· 节目策划与演员\n· 颁奖道具/纪念品\n· 年会手册印制\n\n请问这些是否需要包含在报价中？\n（全部需要 / 部分需要请说明 / 都不需要）'
      });
    }

    // ── 产品发布会标配核查 ──
    if (eventType === EVENT_TYPES.LAUNCH && !data['_launchExtras']) {
      queue.push({
        key: '_launchExtras',
        text: '产品发布会通常还需要：\n· 舞台设计搭建\n· LED大屏/背景屏\n· 灯光音响系统\n· 主持人\n· 邀请函制作与嘉宾管理\n· 媒体记者接待区布置\n\n请问这些是否需要包含在报价中？\n（全部需要 / 部分需要请说明 / 都不需要）'
      });
    }

    // ── 展览展会标配核查 ──
    if (eventType === EVENT_TYPES.EXHIBITION && !data['_exhibitionExtras'] && detectedItems.indexOf('exhibition_booth') === -1) {
      queue.push({
        key: '_exhibitionExtras',
        text: '展览展会通常还需要：\n· 展台/展位设计搭建\n· 灯光照明\n· 展柜/展架\n· 地毯铺设\n· 运输、安装、撤场\n· 垃圾清运\n\n请问这些是否需要包含在报价中？\n（全部需要 / 部分需要请说明 / 都不需要）'
      });
    }

    return queue;
  }

  /**
   * 启动智能报价流程
   * @param {string} input 用户原始输入
   */
  function startSmartQuoteFlow(input) {
    const eventType = detectEventType(input);
    const items = detectMentionedItems(input);
    const basicInfo = extractBasicInfo(input);

    const data = {
      _eventType: eventType,
      _detectedItems: items,
      headcount: basicInfo.headcount || null,
      duration: basicInfo.duration || null
    };

    items.forEach(function (item) {
      data['_has_' + item] = true;
    });

    // ── 从初始消息预填充各物料细节，避免重复询问 ──

    if (items.indexOf('brochure') !== -1) {
      const pagesM = input.match(/(\d+)\s*页/);
      if (pagesM) data['_brochurePages'] = pagesM[1];
      const qtyM = input.match(/(\d+)\s*本/);
      if (qtyM) data['_brochureQty'] = qtyM[1];
      if (/黑白/.test(input))                    data['_brochureColor']  = '黑白';
      else if (/彩色/.test(input))               data['_brochureColor']  = '彩色';
      if (/不需要设计|不用设计|无需设计/.test(input)) data['_brochureDesign'] = '否';
      else if (/需要设计|要设计|含设计/.test(input))  data['_brochureDesign'] = '是';
    }

    if (items.indexOf('exhibition_board') !== -1) {
      const boardM = input.match(/(\d+)\s*块/);
      if (boardM) data['_exhibitionBoardCount'] = boardM[1];
    }

    if (items.indexOf('exhibition_booth') !== -1) {
      const areaM = input.match(/(\d+)\s*(?:平|㎡|平方)/);
      if (areaM) data['_boothArea'] = areaM[1];
    }

    if (items.indexOf('invitation') !== -1) {
      const qtyM = input.match(/(\d+)\s*份/);
      if (qtyM) data['_invitationQty'] = qtyM[1];
    }

    if (items.indexOf('souvenir') !== -1) {
      const souvenirQty = extractItemQuantity(input, 'souvenir');
      if (souvenirQty) data['_souvenirQty'] = souvenirQty;
    }

    if (items.indexOf('photography') !== -1) {
      // 预填充拍摄类型（如初始消息已明确提到）
      const prePhoto = [];
      if (/摄影/.test(input))     prePhoto.push('①');
      if (/摄像/.test(input))     prePhoto.push('②');
      if (/航拍|无人机/.test(input)) prePhoto.push('③');
      if (/直播/.test(input))     prePhoto.push('④');
      if (/后期|剪辑/.test(input)) prePhoto.push('⑤');
      if (prePhoto.length > 0) data['_photoServices'] = prePhoto.join('');
    }

    // 全套：学术/年会/展览/发布会——若用户说"全套"，直接预设为全部需要
    if (/全套|全部物料|全部需要/.test(input)) {
      if (eventType === EVENT_TYPES.ACADEMIC)   data['_academicExtras']   = '全部需要';
      if (eventType === EVENT_TYPES.ANNUAL)     data['_annualExtras']     = '全部需要';
      if (eventType === EVENT_TYPES.LAUNCH)     data['_launchExtras']     = '全部需要';
      if (eventType === EVENT_TYPES.EXHIBITION) data['_exhibitionExtras'] = '全部需要';
    }

    const pendingQuestions = buildQuestionQueue(eventType, items, data);

    quoteState = {
      data: data,
      pendingQuestions: pendingQuestions,
      waitingKey: null
    };

    // 生成开场提示语
    const complexTypes = [EVENT_TYPES.ACADEMIC, EVENT_TYPES.ANNUAL, EVENT_TYPES.LAUNCH, EVENT_TYPES.EXHIBITION];
    let intro;
    if (complexTypes.indexOf(eventType) !== -1 && (items.length > 1 || eventType !== null)) {
      const typeNames = { academic:'学术会议', annual:'年会/颁奖', launch:'产品发布会', exhibition:'展览展会' };
      const tname = typeNames[eventType] || '活动';
      intro = tname + '涉及的物料和配套服务较多，为了避免漏项，我来逐项确认：';
    } else if (items.length > 0) {
      intro = '好的，为您估算报价！还需确认几个配套细节：';
    } else {
      intro = '好的，为您提供报价估算，请先告知几个基本信息：';
    }

    appendBotMsg(intro, function () {
      askNextQuoteQuestion();
    });
  }

  /**
   * 询问下一个待确认问题，若队列为空则输出报价
   */
  function askNextQuoteQuestion() {
    if (quoteState.pendingQuestions.length === 0) {
      const result = calcSmartQuote(quoteState.data);
      // 保存报价上下文，以便用户后续修订
      lastQuoteContext = {
        data: JSON.parse(JSON.stringify(quoteState.data)),
        removedItems: []
      };
      lastPlanContext = null; // 有具体报价后清空预算推荐上下文
      quoteState = null;
      appendBotMsg(result);
      return;
    }
    const next = quoteState.pendingQuestions.shift();
    quoteState.waitingKey = next.key;
    appendBotMsg(next.text);
  }

  /**
   * 处理报价流程中的用户输入
   * @param {string} input
   */
  function handleSmartQuoteStep(input) {
    const key = quoteState.waitingKey;
    const data = quoteState.data;

    if (key === '_eventTypeInput') {
      // 先尝试从文本中识别
      let et = detectEventType(input);
      if (!et) {
        // 用数字/带圈数字映射
        if (/①|^1$/.test(input.trim())) et = EVENT_TYPES.ACADEMIC;
        else if (/②|^2$/.test(input.trim())) et = EVENT_TYPES.EXHIBITION;
        else if (/③|^3$/.test(input.trim())) et = EVENT_TYPES.ANNUAL;
        else if (/④|^4$/.test(input.trim())) et = EVENT_TYPES.LAUNCH;
        else if (/⑤|^5$/.test(input.trim())) et = EVENT_TYPES.OTHER;
      }
      data._eventType = et;
      // 若是学术会议，补充学术额外物料问题（如果尚未在队列中）
      if (et === EVENT_TYPES.ACADEMIC) {
        const alreadyQueued = quoteState.pendingQuestions.some(function (q) {
          return q.key === '_academicExtras';
        });
        if (!alreadyQueued) {
          quoteState.pendingQuestions.push({
            key: '_academicExtras',
            text: '学术会议通常还会需要：\n· 席卡（桌牌）\n· 嘉宾胸牌\n· 会议议程印制\n· 签到台物料\n· 现场指示牌\n\n请问这些是否需要包含在报价中？\n（全部需要 / 部分需要请说明 / 都不需要）'
          });
        }
      }
    } else {
      data[key] = input.trim();
    }

    quoteState.waitingKey = null;
    askNextQuoteQuestion();
  }

  /**
   * 从输入中提取指定物料的数量
   * @param {string} input
   * @param {string} itemKey
   * @returns {number|null}
   */
  function extractItemQuantity(input, itemKey) {
    if (itemKey === 'souvenir') {
      var m = input.match(/(\d+)\s*(?:份|个|件|套|枚|只)\s*(?:纪念品|礼品|伴手礼|小礼品|定制礼品|抽奖礼品|奖品)/)
             || input.match(/(?:纪念品|礼品|伴手礼|小礼品|定制礼品|抽奖礼品|奖品)\s*(\d+)\s*(?:份|个|件|套|枚|只)?/);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  /**
   * 根据收集到的数据计算智能报价
   * @param {Object} data
   * @returns {string} 报价说明文字
   */
  function calcSmartQuote(data) {
    const headcount = parseInt(data.headcount, 10) || 100;
    const duration  = parseInt(data.duration, 10)  || 1;
    const eventType = data._eventType;
    let subtotal = 0;
    const includedItems = [];

    // ── 辅助：解析配套字符串，处理"只需要X"和"不需要X"否定 ──
    function parseDeps(raw, allKeyword) {
      const s = (raw || allKeyword || '全部').toLowerCase();
      const stripped = s.replace(/不(?:需要|用|要)?(\S+)/g, '');
      const onlyMode = /只/.test(s);
      return onlyMode
        ? (s.match(/只(?:需要|要)?(.+)/) || [, stripped])[1]
        : (/全部/.test(s) ? allKeyword : stripped);
    }

    // ── 展览板 ──
    if (data['_has_exhibition_board']) {
      const boardCount = parseInt(data['_exhibitionBoardCount'], 10) || 4;
      const scope = parseDeps(data['_exhibitionBoardDeps'], '设计 制作 运输 安装 撤场 垃圾');
      const needDesign    = /设计/.test(scope);
      const needProd      = /制作|生产/.test(scope);
      const needTransport = /运输/.test(scope);
      const needInstall   = /安装/.test(scope);
      const needDismantle = /撤场|拆除/.test(scope);
      const needWaste     = /垃圾/.test(scope);
      let cost = 0;
      const detail = [];
      if (needDesign)    { cost += boardCount * 2000;        detail.push('设计'); }
      if (needProd)      { cost += boardCount * 1000;        detail.push('制作'); }
      if (needTransport) { cost += 600;                      detail.push('运输'); }
      if (needInstall)   { cost += 300 + boardCount * 150;   detail.push('安装'); }
      if (needDismantle) { cost += 300 + boardCount * 100;   detail.push('撤场'); }
      if (needWaste)     { cost += 3000;                     detail.push('垃圾处理'); }
      if (cost === 0)    { cost += boardCount * 1000;        detail.push('制作'); }
      subtotal += cost;
      includedItems.push('展览板' + (detail.join('、') || '制作') + '（共 ' + boardCount + ' 块）');
    }

    // ── 宣传册 ──
    if (data['_has_brochure']) {
      const pages      = parseInt(data['_brochurePages'], 10) || 20;
      const qty        = parseInt(data['_brochureQty'], 10)   || headcount;
      const isColor    = !/黑白|black/i.test(data['_brochureColor'] || '彩色');
      const needDesign = !/否|no/i.test(data['_brochureDesign'] || '是');
      let cost = 0;
      if (needDesign) cost += pages * 100;
      cost += (isColor ? 3 : 1) * pages * qty;
      subtotal += cost;
      includedItems.push('宣传册' + (needDesign ? '设计排版与' : '') + '印刷（' + qty + '本×' + pages + '页·' + (isColor ? '彩色' : '黑白') + '）');
    }

    // ── 邀请函 ──
    if (data['_has_invitation']) {
      const qty        = parseInt(data['_invitationQty'], 10) || headcount;
      const needDesign = !/否|no/i.test(data['_invitationDesign'] || '是');
      let cost = qty * 8; // ¥8/份印刷
      if (needDesign) cost += 1500; // 设计费
      subtotal += cost;
      includedItems.push('邀请函' + (needDesign ? '设计与' : '') + '印制（' + qty + ' 份）');
    }

    // ── 同声传译（含全套配件） ──
    if (data['_has_interpretation']) {
      const languages     = parseInt(data['_interpLanguages'], 10) || 1;
      const needBooth     = !/否|no/i.test(data['_interpBooth'] || '是');
      const needInterp    = !/否|no/i.test(data['_interpInterpreters'] || '是');
      let cost = 0;
      const interpDetail = [];
      // 设备主机+安装：¥9,500+¥4,000=¥13,500
      cost += 13500;
      interpDetail.push('主机设备');
      // 接收器：¥50/台
      cost += headcount * 50;
      interpDetail.push('接收器 ' + headcount + ' 台');
      // 同传箱（隔音箱）：¥3,500/个/种语言
      if (needBooth) {
        cost += languages * 3500;
        interpDetail.push('同传箱 ' + languages + ' 个');
      }
      // 口译员：¥4,000/天/人，每种语言2名交替
      if (needInterp) {
        cost += languages * 2 * 4000 * duration;
        interpDetail.push('同传口译员（' + languages + '种语言×2人×' + duration + '天）');
      }
      // 多语言加价（频道/配置费）
      if (languages > 1) {
        cost += (languages - 1) * 2000;
        interpDetail.push('多语言频道配置（' + languages + ' 种语言）');
      }
      subtotal += cost;
      includedItems.push('同声传译：' + interpDetail.join('、'));
    }

    // ── 摄影摄像（细分服务） ──
    if (data['_has_photography']) {
      const svc = (data['_photoServices'] || '①②').toLowerCase();
      const hasPhoto    = /①|摄影/.test(svc);
      const hasVideo    = /②|摄像/.test(svc);
      const hasDrone    = /③|航拍|无人机/.test(svc);
      const hasLive     = /④|直播/.test(svc);
      const hasEditing  = /⑤|后期|剪辑/.test(svc);
      let cost = 0;
      const photoDetail = [];
      if (hasPhoto)   { cost += 3000 * duration; photoDetail.push('摄影'); }
      if (hasVideo)   { cost += 3000 * duration; photoDetail.push('摄像'); }
      if (hasDrone)   { cost += 2000 * duration; photoDetail.push('航拍'); }
      if (hasLive)    { cost += 5000;            photoDetail.push('现场直播'); }
      if (hasEditing) { cost += 3000;            photoDetail.push('后期剪辑'); }
      if (cost === 0) { cost = 6000 * duration;  photoDetail.push('摄影摄像'); }
      subtotal += cost;
      includedItems.push(photoDetail.join('、') + '（' + duration + ' 天）');
    }

    // ── 主持人 ──
    if (data['_has_mc']) {
      const level = (data['_mcLevel'] || '①').toLowerCase();
      let cost = 0;
      let mcStr = '';
      if (/③|知名|明星/.test(level))      { cost = 30000; mcStr = '知名/明星主持人'; }
      else if (/②|专业|庆典/.test(level)) { cost = 8000 * duration;  mcStr = '专业庆典主持人'; }
      else                                  { cost = 3000 * duration;  mcStr = '礼仪主持人'; }
      subtotal += cost;
      includedItems.push(mcStr + '（' + duration + ' 天）');
    }

    // ── 灯光音响（独立） ──
    if (data['_has_lighting_audio'] && !data['_has_stage']) {
      const scope = (data['_lightingScope'] || '②').toLowerCase();
      let cost = 0;
      if (/③|户外/.test(scope))          cost = 30000;
      else if (/②|大型|大场/.test(scope)) cost = 20000;
      else                                 cost = 5000;
      subtotal += cost;
      includedItems.push('灯光音响系统（' + duration + ' 天）');
    }

    // ── LED大屏/投影（独立） ──
    if (data['_has_led_screen'] && !data['_has_stage']) {
      const sizeInput = (data['_ledSize'] || '4×2');
      const sizeMatch = sizeInput.match(/(\d+)\s*[×x]\s*(\d+)/i);
      const area = sizeMatch ? parseFloat(sizeMatch[1]) * parseFloat(sizeMatch[2]) : 8;
      let cost = area * 800 * duration; // ¥800/㎡/天租赁
      subtotal += cost;
      includedItems.push('LED大屏（约 ' + area.toFixed(0) + '㎡，' + duration + ' 天）');
    }

    // ── 餐饮茶歇（细分） ──
    if (data['_has_catering']) {
      const ctype = (data['_cateringType'] || '茶歇').toLowerCase();
      const hasMeal  = /正餐|午餐|晚餐/.test(ctype);
      const hasBreak = /茶歇|咖啡/.test(ctype) || !hasMeal;
      let cost = 0;
      const cDetail = [];
      if (hasBreak) { cost += headcount * 50 * duration;  cDetail.push('茶歇'); }
      if (hasMeal)  { cost += headcount * 100 * duration; cDetail.push('正餐'); }
      subtotal += cost;
      includedItems.push(cDetail.join('与') + '（' + headcount + '人 × ' + duration + '天）');
    }

    // ── 背景板 ──
    if (data['_has_backdrop']) {
      const needDesign = !/否|no/i.test(data['_backdropDesign'] || '是');
      const sizeInput  = data['_backdropSize'] || '4×2';
      const sizeM      = sizeInput.match(/(\d+(?:\.\d+)?)\s*[×x×]\s*(\d+(?:\.\d+)?)/i);
      const w = sizeM ? parseFloat(sizeM[1]) : 4;
      const h = sizeM ? parseFloat(sizeM[2]) : 2;
      const needLight  = /是|yes|要/.test(data['_backdropLight'] || '否');
      let cost = 0;
      if (needDesign) cost += 1500;
      cost += w * h * 120; // ¥120/㎡ 打印+材料
      if (needLight)  cost += 2000;
      subtotal += cost;
      includedItems.push('背景板' + (needDesign ? '设计与' : '') + '制作（' + w + '×' + h + '米）' + (needLight ? '及灯光' : ''));
    }

    // ── 展台/展位搭建 ──
    if (data['_has_exhibition_booth']) {
      const area       = parseInt(data['_boothArea'], 10) || 36;
      const needDesign = !/否|no/i.test(data['_boothDesign'] || '是');
      const scope      = parseDeps(data['_boothExtras'], '灯光 展柜 地毯 运输 安装 撤场 垃圾');
      const needLight    = /灯光/.test(scope);
      const needCabinet  = /展柜|展架/.test(scope);
      const needCarpet   = /地毯/.test(scope);
      const needDismantle= /运输|安装|撤场/.test(scope);
      const needWaste    = /垃圾/.test(scope);
      let cost = 0;
      if (needDesign)    cost += 5000;
      cost += area * 350; // ¥350/㎡ 基础搭建
      if (needLight)     cost += area * 30;
      if (needCabinet)   cost += area * 80;
      if (needCarpet)    cost += area * 30;
      if (needDismantle) cost += 3000 + area * 50;
      if (needWaste)     cost += 3000;
      subtotal += cost;
      includedItems.push('展台搭建（' + area + '㎡）含全套配套');
    }

    // ── 舞台搭建 ──
    if (data['_has_stage']) {
      const sizeInput  = data['_stageSize'] || '8×6×0.8';
      const sizeM      = sizeInput.match(/(\d+)\s*[×x×]\s*(\d+)/i);
      const sw = sizeM ? parseFloat(sizeM[1]) : 8;
      const sd = sizeM ? parseFloat(sizeM[2]) : 6;
      const area = sw * sd;
      const stageScope = parseDeps(data['_stageExtras'], '灯光 音响 大屏');
      const needLA  = /灯光|音响/.test(stageScope);
      const needLED = /大屏|LED|背景屏/.test(stageScope);
      let cost = area * 600; // ¥600/㎡ 舞台搭建
      const stageDetail = ['舞台搭建（' + sw + '×' + sd + '米）'];
      if (needLA)  { cost += 20000 * duration; stageDetail.push('灯光音响'); }
      if (needLED) { cost += area * 800;       stageDetail.push('LED大屏'); }
      subtotal += cost;
      includedItems.push(stageDetail.join('、'));
    }

    // ── 学术会议额外物料 ──
    if (data['_academicExtras']) {
      const ex = data['_academicExtras'].toLowerCase();
      const all = /全部|都要/.test(ex);
      if (all || /席卡|桌牌/.test(ex))       { subtotal += headcount * 5;     includedItems.push('席卡（' + headcount + ' 个）'); }
      if (all || /胸牌|证件|名牌/.test(ex))  { subtotal += headcount * 5;     includedItems.push('嘉宾胸牌（' + headcount + ' 个）'); }
      if (all || /议程/.test(ex))             { subtotal += headcount * 4 * 5; includedItems.push('会议议程（' + headcount + ' 份，约 4 页）'); }
      if (all || /签到/.test(ex))             { subtotal += 500;               includedItems.push('签到台物料'); }
      if (all || /指示牌|指引牌/.test(ex))   { subtotal += 6 * 35;            includedItems.push('现场指示牌（约 6 个）'); }
    }

    // ── 年会/颁奖晚会额外 ──
    if (data['_annualExtras']) {
      const ex = data['_annualExtras'].toLowerCase();
      const all = /全部|都要/.test(ex);
      if ((all || /舞台/.test(ex)) && !data['_has_stage'])         { subtotal += 30000; includedItems.push('舞台搭建与灯光音响（基础）'); }
      if ((all || /主持人|司仪/.test(ex)) && !data['_has_mc'])     { subtotal += 5000 * duration; includedItems.push('主持人/司仪'); }
      if (all || /节目|演员/.test(ex))                             { subtotal += 20000; includedItems.push('节目策划与演员（基础配置）'); }
      if (all || /纪念品|道具|颁奖/.test(ex))                      { subtotal += headcount * 50; includedItems.push('颁奖道具/纪念品（' + headcount + ' 份）'); }
      if (all || /手册|印刷/.test(ex))                             { subtotal += headcount * 30; includedItems.push('年会手册（' + headcount + ' 份）'); }
    }

    // ── 产品发布会额外 ──
    if (data['_launchExtras']) {
      const ex = data['_launchExtras'].toLowerCase();
      const all = /全部|都要/.test(ex);
      if ((all || /舞台/.test(ex)) && !data['_has_stage'])         { subtotal += 30000; includedItems.push('舞台设计搭建'); }
      if ((all || /大屏|led|投影/.test(ex)) && !data['_has_led_screen']) { subtotal += 15000; includedItems.push('LED大屏/背景屏'); }
      if ((all || /灯光|音响/.test(ex)) && !data['_has_lighting_audio']) { subtotal += 20000; includedItems.push('灯光音响系统'); }
      if ((all || /主持人/.test(ex)) && !data['_has_mc'])          { subtotal += 5000; includedItems.push('主持人'); }
      if ((all || /邀请函/.test(ex)) && !data['_has_invitation'])  { subtotal += headcount * 12; includedItems.push('邀请函（' + headcount + ' 份）'); }
      if (all || /媒体|记者/.test(ex))                             { subtotal += 5000; includedItems.push('媒体记者区布置'); }
    }

    // ── 展览展会额外 ──
    if (data['_exhibitionExtras']) {
      const ex = data['_exhibitionExtras'].toLowerCase();
      const all = /全部|都要/.test(ex);
      const area = 36;
      if ((all || /展台|展位|搭建/.test(ex)) && !data['_has_exhibition_booth']) { subtotal += area * 350; includedItems.push('展台搭建（约 ' + area + '㎡）'); }
      if ((all || /灯光/.test(ex)) && !data['_has_lighting_audio'])  { subtotal += 5000; includedItems.push('展位灯光照明'); }
      if (all || /展柜|展架/.test(ex))   { subtotal += 3000; includedItems.push('展柜/展架'); }
      if (all || /地毯/.test(ex))         { subtotal += area * 30; includedItems.push('地毯铺设（' + area + '㎡）'); }
      if (all || /运输|安装|撤场/.test(ex)) { subtotal += 5000; includedItems.push('运输、安装、撤场'); }
      if (all || /垃圾/.test(ex))         { subtotal += 3000; includedItems.push('垃圾清运'); }
    }

    // ── 独立提及但未被事件核查覆盖的小物料 ──
    if (data['_has_table_cards'] && !data['_academicExtras'])   { subtotal += headcount * 5; includedItems.push('席卡（' + headcount + ' 个）'); }
    if (data['_has_name_badges'] && !data['_academicExtras'])   { subtotal += headcount * 5; includedItems.push('嘉宾胸牌（' + headcount + ' 个）'); }
    if (data['_has_signage'] && !data['_academicExtras'])        { subtotal += 6 * 35;        includedItems.push('现场指示牌（约 6 个）'); }
    if (data['_has_registration'] && !data['_academicExtras'])   { subtotal += 500;            includedItems.push('签到台物料'); }
    if (data['_has_agenda'] && !data['_academicExtras'])         { subtotal += headcount * 20; includedItems.push('会议议程（' + headcount + ' 份）'); }
    if (data['_has_waste_disposal'] && !data['_has_exhibition_board'] && !data['_has_exhibition_booth']) {
      subtotal += 3000;
      includedItems.push('垃圾清运');
    }
    if (data['_has_souvenir']) {
      const souvenirQty = parseInt(data['_souvenirQty'], 10) || headcount;
      const souvenirUnit = parseFloat(data['_souvenirUnitPrice']) || 50;
      subtotal += souvenirQty * souvenirUnit;
      includedItems.push('纪念品 / 礼品（' + souvenirQty + ' 份 × ¥' + souvenirUnit + '/份估算）');
    }

    // ── 未识别任何物料 ──
    if (subtotal === 0) {
      return '暂未识别到具体物料需求，请补充说明所需服务，或直接拨打 ' + COMPANY_PHONE + ' 与顾问沟通。';
    }

    // ── 价格区间 ──
    const taxedPrice = subtotal * 1.06;
    const lower = roundToThousand(taxedPrice * 0.95);
    const upper = roundToThousand(taxedPrice * 1.30);

    const eventTypeLabels = {};
    eventTypeLabels[EVENT_TYPES.ACADEMIC]   = '学术会议';
    eventTypeLabels[EVENT_TYPES.EXHIBITION] = '展览展会';
    eventTypeLabels[EVENT_TYPES.ANNUAL]     = '年会/颁奖';
    eventTypeLabels[EVENT_TYPES.LAUNCH]     = '产品发布会';
    eventTypeLabels[EVENT_TYPES.OTHER]      = '其他活动';
    const eventTypeStr = (eventType && eventTypeLabels[eventType]) || '活动';

    const itemLines = includedItems.map(function (it) { return '· ' + it; }).join('\n');

    return (
      '根据您提供的信息，初步报价估算如下：\n' +
      '活动类型：' + eventTypeStr + '\n' +
      '人数：' + headcount + ' 人\n' +
      '时长：' + duration + ' 天\n\n' +
      '本次报价已包含：\n' +
      itemLines + '\n\n' +
      '初步报价区间为：\n' +
      '【 ' + formatWan(lower) + ' ～ ' + formatWan(upper) + ' 】\n\n' +
      '以上为含税初步参考价，最终报价需要根据实际尺寸、数量、设计复杂度、场地要求和执行细节确认。\n\n' +
      '如需详细报价单，欢迎联系我们：\n' +
      '电话：' + COMPANY_PHONE + '\n' +
      '邮箱：' + COMPANY_EMAIL
    );
  }

  /**
   * 四舍五入到千位
   * @param {number} val
   * @returns {number}
   */
  function roundToThousand(val) {
    return Math.round(val / 1000) * 1000;
  }

  /**
   * 将数值格式化为"¥X.X万"形式
   * @param {number} val
   * @returns {string}
   */
  function formatWan(val) {
    if (val < 10000) return '¥' + val.toLocaleString('zh-CN');
    return '¥' + (val / 10000).toFixed(1) + ' 万';
  }

  /**
   * 检测用户输入是否触发报价流程
   * @param {string} input
   * @returns {boolean}
   */
  function isQuoteTrigger(input) {
    return QUOTE_TRIGGER_WORDS.some(function (w) { return input.indexOf(w) !== -1; });
  }

  /**
   * 检测消息是否包含服务/物料需求描述
   * @param {string} input
   * @returns {boolean}
   */
  function hasServiceDescription(input) {
    return /宣传册|茶歇|餐饮|展台|展位|展览板|年会|颁奖|发布会|摄影|摄像|航拍|直播|同传|翻译|设计|印刷|策划|搭建|布置|席卡|胸牌|议程|指示牌|签到|背景板|背景墙|舞台|灯光|音响|大屏|LED|邀请函|主持人|司仪|展柜|地毯|垃圾清运|纪念品|礼品|伴手礼/.test(input);
  }

  // ─────────────────────────────────────────────
  // 意图检测
  // ─────────────────────────────────────────────

  /**
   * 检测用户输入中的意图，返回一个含 has(intent) 方法的对象
   * @param {string} input
   */
  function detectIntent(input) {
    const found = [];

    // 预算推荐查询（优先于普通报价）
    if (/预算.*可以做|可以做.*预算|预算.*够吗|够不够|能做什么|可以做什么|能包含|做到什么程度|能安排什么|方案.*预算|预算.*方案|预算.*学术|学术.*预算|预算.*年会|年会.*预算/.test(input) ||
        (/预算/.test(input) && /可以|够|做|包含|安排|方案|什么/.test(input))) {
      found.push('budget_plan');
    }

    // 预约/准备时间类
    if (/提前多久|多久预约|多久订|提前预约|什么时候预约|预约时间|预定时间|需要提前|多长时间|多久前|多久准备|准备周期|制作周期|book in advance|how early/.test(input)) {
      found.push('booking_time');
    }
    // 报价类
    if (/报价|价格|多少钱|费用|预算|收费|cost|price|quote/.test(input)) {
      found.push('quotation');
    }
    // 公司介绍查询
    if (/你们是什么公司|你们公司|公司介绍|公司是做什么的|你们是做什么的|你们是谁|什么公司|主要业务|公司背景|company profile|about company|who are you|what company/.test(input)) {
      found.push('company_profile');
    }
    // 服务范围查询
    if (/你们做什么|你们提供什么|有什么服务|服务内容|服务有哪些|包含什么|能不能做|可以做什么|能做什么|能做吗|提供什么|什么业务|业务范围|你们能做|公司服务|service scope|event service/.test(input)) {
      found.push('service_scope');
    }
    // 学术会议类型
    if (/学术会议|研讨会|论坛|峰会|conference|seminar|forum/.test(input)) {
      found.push('academic_conference');
    }
    // 物料相关
    if (/宣传册|手册|展览板|展板|席卡|胸牌|会议议程|指示牌|签到物料|物料|桌牌/.test(input)) {
      found.push('materials');
    }
    // 摄影摄像
    if (/摄影|摄像|拍照|录像|直播|航拍/.test(input)) {
      found.push('photography');
    }
    // 餐饮茶歇
    if (/茶歇|餐饮|午餐|晚餐|咖啡|饮料|用餐/.test(input)) {
      found.push('catering');
    }

    return {
      primary: found[0] || null,
      all:     found,
      has:     function (intent) { return found.indexOf(intent) !== -1; }
    };
  }

  /**
   * 检测消息是否与活动/会议策划相关（用于防止过早触发联系收集）
   * @param {string} input
   * @returns {boolean}
   */
  function isEventRelated(input) {
    return /活动|会议|学术会议|年会|发布会|论坛|峰会|研讨会|培训|展览|展板|宣传册|席卡|茶歇|摄影|摄像|报价|预约|搭建|物料|设计|印刷|同传|翻译|舞台|灯光|音响|嘉宾|签到|胸牌|议程/.test(input);
  }

  /**
   * 根据活动类型返回预约时间建议
   * @param {string|null} eventType
   * @returns {string}
   */
  function getBookingTimeAnswer(eventType) {
    if (eventType === EVENT_TYPES.ACADEMIC) {
      return '学术会议一般建议至少提前 3–4 周预约。\n\n如果涉及以下内容，建议提前 1–2 个月准备：\n· 宣传册 / 会议手册（设计 + 印刷）\n· 展览板（设计 + 制作 + 安装）\n· 席卡、胸牌、会议议程（印制）\n· 摄影摄像、茶歇餐饮\n· 现场搭建与撤场\n\n这些内容通常需要确认设计稿、修改排版、安排印刷、运输和现场执行，每个环节都需要提前协调。\n\n请问您的会议大概多少人、几天？需要宣传册、展览板、席卡或茶歇吗？我可以帮您初步判断准备周期。';
    }
    if (eventType === EVENT_TYPES.ANNUAL) {
      return '年会建议预约时间：\n· 含酒店 / 宴会场地：至少提前 1 个月\n· 不含酒店场地：至少提前 20 天\n· 如有舞台搭建、无人机表演或复杂节目：建议提前 2–3 个月\n\n请问您的年会大概多少人？需要哪些配套服务？';
    }
    if (eventType === EVENT_TYPES.EXHIBITION) {
      return '展览展会建议至少提前 15–20 天预约。如有特装展台设计搭建、同声传译或无人机表演需求，建议提前 1–3 个月。\n\n请问是哪种展会？展位大约多大？需要哪些服务？';
    }
    if (eventType === EVENT_TYPES.LAUNCH) {
      return '产品发布会建议至少提前 3–4 周预约。如有复杂舞台、LED大屏、媒体直播或嘉宾邀请需求，建议提前 1–2 个月。\n\n请问发布会大概多少人参加？需要哪些配套服务？';
    }
    // 通用回复
    return '一般活动建议提前预约时间参考：\n· 小型活动（50人以内）：提前 2–3 周\n· 中型活动（50–200人）：提前 1 个月\n· 大型或复杂活动（200人以上 / 多服务模块）：提前 2–3 个月\n· 如有同传设备、无人机表演：至少提前 1–3 个月\n\n建议越早启动越好，以确保资源档期充足、方案打磨充分。\n\n请问您的活动类型、人数和大概日期是什么？';
  }

  function getCompanyProfileAnswer() {
    return '上海和珈文化传媒有限公司是一家活动策划与执行服务公司，主要为企业、机构和活动主办方提供会议、年会、发布会、展览展示、摄影摄像、舞台搭建、灯光音响、物料制作和现场执行等服务。\n\n我们可以根据客户的活动类型、人数、预算、场地和物料需求，协助规划合适的活动方案，并提供初步费用估算。\n\n您可以告诉我活动类型、人数和预算，我可以帮您初步判断可以做哪些内容。';
  }

  function getServiceScopeAnswer() {
    return '我们主要可以协助以下服务：\n\n1. 活动策划与执行\n· 公司年会\n· 学术会议 / 论坛 / 研讨会\n· 产品发布会\n· 展览展示活动\n· 企业培训会议\n\n2. 现场搭建与设备\n· 舞台搭建\n· 背景板 / 展览板\n· 灯光音响\n· LED屏 / 投影\n· 指示牌 / 签到区布置\n\n3. 活动物料\n· 宣传册 / 年会手册\n· 席卡 / 胸牌 / 会议议程\n· 邀请函\n· 纪念品 / 礼品\n· 颁奖物料\n\n4. 人员与执行服务\n· 主持人 / 司仪\n· 摄影摄像\n· 现场执行人员\n· 茶歇 / 简餐协调\n\n如果您愿意提供活动类型、人数、预算和活动天数，我可以帮您初步推荐适合的方案。';
  }

  function getEventCapabilityAnswer(eventType) {
    if (eventType === EVENT_TYPES.ANNUAL) {
      return '可以的，我们可以承接公司年会及颁奖晚会的全流程策划与执行，主要包括：\n\n· 年会流程策划与统筹\n· 主持人 / 司仪安排\n· 舞台搭建与灯光音响\n· 摄影摄像\n· 颁奖道具与纪念品\n· 年会手册制作\n· 茶歇 / 简餐协调\n· 现场执行人员\n\n如果您有具体人数和预算，我也可以继续帮您估算方案。';
    }
    if (eventType === EVENT_TYPES.ACADEMIC) {
      return '可以的，我们可以承接学术会议、论坛及研讨会的执行服务，主要包括：\n\n· 签到台物料\n· 席卡 / 桌牌\n· 嘉宾胸牌\n· 会议议程印制\n· 现场指示牌\n· 宣传册 / 会议手册\n· 展览板\n· 摄影摄像\n· 茶歇 / 餐饮协调\n· 现场执行人员\n\n如果您有具体人数和预算，我也可以继续帮您估算方案。';
    }
    if (eventType === EVENT_TYPES.LAUNCH) {
      return '可以的，我们可以承接产品发布会的策划与执行服务，主要包括：\n\n· 舞台设计与搭建\n· 背景板\n· LED大屏 / 投影\n· 灯光音响系统\n· 主持人\n· 摄影摄像\n· 媒体记者接待区布置\n· 现场执行人员\n\n如果您有具体人数和预算，我也可以继续帮您估算方案。';
    }
    if (eventType === EVENT_TYPES.EXHIBITION) {
      return '可以的，我们可以承接展览展会及展示活动的搭建与执行服务，主要包括：\n\n· 展台 / 展位设计搭建\n· 展览板设计与制作\n· 灯光照明\n· 指示牌\n· 展柜 / 展架\n· 运输、安装、撤场\n· 垃圾清运\n\n如果您有具体人数和预算，我也可以继续帮您估算方案。';
    }
    return getServiceScopeAnswer();
  }

  // ─────────────────────────────────────────────
  // 报价修订 & 预算推荐
  // ─────────────────────────────────────────────

  /**
   * 从用户输入中提取预算金额（支持"万"、"k/K/w/W"、大数字）
   * @param {string} input
   * @returns {number|null}
   */
  function extractBudget(input) {
    const wanMatch = input.match(/(\d+(?:\.\d+)?)\s*万/);
    if (wanMatch) return Math.round(parseFloat(wanMatch[1]) * 10000);
    const kwMatch = input.match(/(\d+(?:\.\d+)?)\s*[kKwW](?![一-龥])/);
    if (kwMatch) return Math.round(parseFloat(kwMatch[1]) * 10000);
    const bigMatch = input.match(/(?:¥|RMB)?\s*(\d{5,})/);
    if (bigMatch) return parseInt(bigMatch[1], 10);
    return null;
  }

  /**
   * 检测用户输入是否属于报价/预算修订意图
   * @param {string} input
   * @returns {boolean}
   */
  function detectQuoteRevisionIntent(input) {
    if (/不要|去掉|删除|取消|不需要|不用|先不算|remove|exclude|不含|排除/.test(input)) return true;
    if (/加上|增加|再加|加个|加一个|算上|include|add|加入/.test(input)) return true;
    if (/换成|改成|改为|变成/.test(input)) return true;
    if (/只要|只保留|只做|仅需要|只需要/.test(input)) return true;
    if (/需要|保留/.test(input) && (lastQuoteContext || lastPlanContext)) return true;
    // 带数字的人数/天数变更（仅当有历史上下文时）
    if ((lastQuoteContext || lastPlanContext) &&
        /(\d+)\s*(?:人|位|名|天|日)/.test(input)) return true;
    return false;
  }

  /**
   * 从用户输入中检测涉及的物料键（基于 ITEM_ALIASES）
   * @param {string} input
   * @returns {string[]}
   */
  function detectQuoteItems(input) {
    const found = [];
    const keys = Object.keys(ITEM_ALIASES);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const aliases = ITEM_ALIASES[key];
      for (let j = 0; j < aliases.length; j++) {
        if (input.indexOf(aliases[j]) !== -1) {
          found.push(key);
          break;
        }
      }
    }
    return found;
  }

  /**
   * 根据人数和预算生成推荐方案说明
   * @param {{ headcount, budget, eventType, duration }} data
   * @returns {string}
   */
  function recommendPlanByBudget(data) {
    const headcount     = parseInt(data.headcount, 10) || 100;
    const budget        = data.budget || 0;
    const eventType     = data.eventType;
    const duration      = parseInt(data.duration, 10) || 1;
    const perPerson     = budget / headcount;
    const excludedItems = data.excludedItems || [];
    const requiredItems = data.requiredItems || [];
    const onlyItems     = data.onlyItems     || [];
    const isRevision    = excludedItems.length > 0 || requiredItems.length > 0 || onlyItems.length > 0;

    // Save full lastPlanContext preserving constraints
    lastPlanContext = {
      headcount: headcount, budget: budget, eventType: eventType,
      duration: duration, perPerson: perPerson,
      requiredItems: requiredItems, excludedItems: excludedItems,
      onlyItems: onlyItems, userConstraints: data.userConstraints || []
    };

    let levelLabel;
    if      (perPerson < 200)  levelLabel = '非常基础';
    else if (perPerson < 400)  levelLabel = '基础';
    else if (perPerson < 700)  levelLabel = '中等';
    else if (perPerson < 1200) levelLabel = '较充足';
    else                        levelLabel = '充足';

    const typeLabelMap = { academic: '学术会议', annual: '年会/颁奖', launch: '产品发布会', exhibition: '展览展会' };
    const typeLabel = (eventType && typeLabelMap[eventType]) || '活动';

    // ── 过滤辅助函数 ──
    function matchKey(label, k) { return ITEM_PATTERNS[k] && ITEM_PATTERNS[k].test(label); }
    function isExcluded(label)  { return excludedItems.some(function(k) { return matchKey(label, k); }); }
    function isRequired(label)  { return requiredItems.some(function(k) { return matchKey(label, k); }); }
    function isCoreExec(label)  {
      return /年会流程策划|现场执行人员|签到区|签到台物料|基础现场执行支持|基础指示牌/.test(label);
    }
    function filterPool(pool) {
      return pool.filter(function(item) {
        if (isExcluded(item)) return false;
        if (onlyItems.length > 0 && !isCoreExec(item) && !isRequired(item)) return false;
        return true;
      });
    }

    // ── 物料池 ──
    let corePool, recPool, highPool;
    if (eventType === EVENT_TYPES.ANNUAL) {
      corePool = ['年会流程策划', '主视觉设计与基础背景', '主持人 / 司仪', '签到区布置', '基础摄影', '现场执行人员'];
      recPool  = ['灯光音响', 'LED屏或投影', '年会手册印制', '节目策划或简单表演', '颁奖物料', '茶歇或简餐'];
      highPool = ['专业摄像', '舞美精装设计', '专业演出节目', '现场直播', '酒店宴会协调', '礼品定制', '抽奖互动系统'];
    } else {
      corePool = ['签到台物料', '席卡 / 桌牌', '嘉宾胸牌', '会议议程印制', '基础指示牌', '基础现场执行支持'];
      recPool  = ['简单背景板 / 主视觉', '基础摄影', '简单茶歇', '宣传册（简版）'];
      highPool = ['宣传册设计与印刷（大量）', '展览板（设计+制作+安装）', '专业摄影摄像', '茶歇（全程）', '运输安装撤场'];
    }

    // ── 按预算等级分配 rawRec / rawExceed ──
    let rawRec, rawExceed;
    if (eventType === EVENT_TYPES.ANNUAL) {
      if      (perPerson < 300)  { rawRec = corePool.slice(0, 3); rawExceed = [...corePool.slice(3), ...recPool, ...highPool]; }
      else if (perPerson < 700)  { rawRec = [...corePool];         rawExceed = [...recPool, ...highPool]; }
      else if (perPerson < 1500) { rawRec = [...corePool, ...recPool]; rawExceed = highPool.slice(); }
      else                        { rawRec = [...corePool, ...recPool, ...highPool.slice(0, 4)]; rawExceed = highPool.slice(4); }
    } else {
      const premItems = ['舞台搭建与灯光音响', '同声传译设备', '现场直播', '大规模展陈搭建'];
      if      (perPerson < 200)  { rawRec = corePool.slice(0, 3); rawExceed = [...corePool.slice(3), ...recPool, ...highPool, ...premItems]; }
      else if (perPerson < 400)  { rawRec = [...corePool]; rawExceed = [...recPool, ...highPool, ...premItems]; }
      else if (perPerson < 700)  { rawRec = [...corePool, ...recPool.slice(0, 3)]; rawExceed = [...recPool.slice(3), ...highPool, ...premItems]; }
      else if (perPerson < 1200) { rawRec = [...corePool, ...recPool, ...highPool.slice(0, 3)]; rawExceed = [...highPool.slice(3), ...premItems]; }
      else                        { rawRec = [...corePool, ...recPool, ...highPool]; rawExceed = premItems.slice(); }
    }

    // ── 确保 requiredItems 出现在 rawRec 中 ──
    requiredItems.forEach(function(k) {
      const inRec    = rawRec.some(function(item)    { return matchKey(item, k); });
      const inExceed = rawExceed.some(function(item) { return matchKey(item, k); });
      if (!inRec) {
        if (inExceed) rawExceed = rawExceed.filter(function(item) { return !matchKey(item, k); });
        rawRec.push((ITEM_ALIASES[k] || [k])[0]);
      }
    });

    // ── 更新摄影/摄像标签以反映天数 ──
    if (duration > 1) {
      var relabelPhoto = function(pool) {
        return pool.map(function(item) {
          return (ITEM_PATTERNS.photography && ITEM_PATTERNS.photography.test(item))
            ? duration + '天摄影 / 摄像记录'
            : item;
        });
      };
      rawRec    = relabelPhoto(rawRec);
      rawExceed = relabelPhoto(rawExceed);
    }

    // ── 应用过滤 ──
    const recommended = filterPool(rawRec);
    let   mayExceed   = filterPool(rawExceed);

    // 摄影专注模式：若 mayExceed 已被清空，补充摄影专项升级项
    if (onlyItems.indexOf('photography') !== -1 && mayExceed.length === 0) {
      mayExceed = ['专业摄像团队', '后期剪辑制作', '活动花絮短视频', '多机位拍摄'];
    }

    const budgetStr = formatWan(budget);
    let resp = '';

    // ── 响应头 ──
    if (isRevision) {
      resp += '按 ' + headcount + ' 人、预算约 ' + budgetStr;
      if (duration > 1) resp += '、活动时长 ' + duration + ' 天';
      resp += '，人均约 ¥' + Math.round(perPerson) + '，调整后方案：\n\n';
    } else {
      resp += '按 ' + headcount + ' 人、预算约 ' + budgetStr + ' 来看，人均预算约 ¥' + Math.round(perPerson) + '，属于' + levelLabel;
      resp += (eventType === EVENT_TYPES.ANNUAL ? '年会' : '会议') + '预算。\n\n';
      resp += (eventType ? '如果是' + typeLabel + '，这个预算' : '这个预算');
      resp += (perPerson < 200 ? '只能支持最基础的活动执行' : '通常可以考虑') + '：\n';
    }

    // ── 推荐清单 ──
    if (recommended.length > 0) {
      if (isRevision) resp += '调整后建议方案：\n';
      recommended.forEach(function(item) { resp += '· ' + item + '\n'; });
    } else {
      resp += '（在您的约束条件下，仅保留基础活动执行支持）\n';
    }

    // ── 已排除项（仅修订模式显示）──
    if (isRevision && excludedItems.length > 0) {
      resp += '\n已不再包含：\n';
      excludedItems.forEach(function(k) { resp += '· ' + (ITEM_ALIASES[k] || [k])[0] + '\n'; });
    }

    // ── 可升级项 ──
    if (mayExceed.length > 0) {
      resp += '\n可考虑升级：\n';
      mayExceed.slice(0, 5).forEach(function(item) { resp += '· ' + item + '\n'; });
    }

    if (perPerson < 200 && !isRevision) {
      resp += '\n预算较紧张，建议优先保留核心执行项目，其余可按重要性逐项评估。';
    }

    // ── 追问 ──
    const qs = [];
    if (!isRevision) {
      if (!eventType)     qs.push('活动类型（学术会议 / 年会 / 展览 / 发布会）');
      if (!data.duration) qs.push('活动几天');
    }
    if (onlyItems.indexOf('photography') !== -1 || requiredItems.indexOf('photography') !== -1) {
      qs.push('摄影是只需要照片记录，还是也需要摄像、后期剪辑或活动花絮短视频？');
    } else if (!isRevision) {
      qs.push('是否有特定的必选项目（如摄影摄像、背景板、茶歇等）？');
    }

    if (qs.length > 0) {
      resp += '\n\n';
      if (!isRevision) {
        resp += '为了给您更准确的方案，请问：\n';
        qs.forEach(function(q, i) { resp += (i + 1) + '. ' + q + '\n'; });
        resp += '告知后我可以帮您按预算优先排列并初步估算报价。';
      } else {
        qs.forEach(function(q) { resp += q + '\n'; });
      }
    }

    resp += '\n\n以上为预算方向建议，最终需根据具体场地和执行细节确认。';
    return resp;
  }

  // ── 预算推荐多轮流程 ──

  function startBudgetPlanFlow(input) {
    const eventType = detectEventType(input);
    const budget    = extractBudget(input);
    const hcMatch   = input.match(/(\d+)\s*(?:人|位|名)/);
    const headcount = hcMatch ? parseInt(hcMatch[1], 10) : null;
    const dayMatch  = input.match(/(\d+)\s*(?:天|日)/);
    const duration  = dayMatch ? parseInt(dayMatch[1], 10) : null;
    budgetState = { data: { eventType: eventType, headcount: headcount, budget: budget, duration: duration }, waitingKey: null };
    continueBudgetPlanFlow();
  }

  function handleBudgetPlanStep(input) {
    if (!budgetState) return;
    const key = budgetState.waitingKey;
    if (key === 'headcount') {
      const m = input.match(/(\d+)/);
      if (m) budgetState.data.headcount = parseInt(m[1], 10);
    } else if (key === 'budget') {
      const b = extractBudget(input);
      if (b) {
        budgetState.data.budget = b;
      } else {
        const m = input.match(/(\d+)/);
        if (m) { const n = parseInt(m[1], 10); budgetState.data.budget = n < 1000 ? n * 10000 : n; }
      }
    } else if (key === 'eventType') {
      const et = detectEventType(input);
      budgetState.data.eventType = et || EVENT_TYPES.OTHER;
    } else if (key === 'duration') {
      const m = input.match(/(\d+)/);
      if (m) budgetState.data.duration = parseInt(m[1], 10);
    }
    budgetState.waitingKey = null;
    continueBudgetPlanFlow();
  }

  function continueBudgetPlanFlow() {
    if (!budgetState) return;
    const d = budgetState.data;
    if (!d.budget) {
      budgetState.waitingKey = 'budget';
      appendBotMsg('请问您的预算大约是多少？（例如：5万、20万）');
      return;
    }
    if (!d.headcount) {
      budgetState.waitingKey = 'headcount';
      appendBotMsg('请问预计参与人数是多少？（例如：100人）');
      return;
    }
    if (!d.eventType) {
      budgetState.waitingKey = 'eventType';
      appendBotMsg('请问活动类型是年会、学术会议、展览展会还是发布会？');
      return;
    }
    const resp = recommendPlanByBudget(d);
    budgetState = null;
    appendBotMsg(resp);
  }

  /**
   * 处理 pendingPlanAction 中等待"加入/去掉"确认的用户回复
   * @param {string} input
   */
  function handlePendingPlanAction(input) {
    if (!pendingPlanAction || !lastPlanContext) { pendingPlanAction = null; return; }
    const items = pendingPlanAction.items;

    const isAdd    = /加入|加上|增加|要|需要|是|对|可以|保留|好/.test(input);
    const isRemove = /去掉|不要|不用|不需要|否|不加|删除|取消|不/.test(input);

    if (isAdd && !isRemove) {
      items.forEach(function(k) {
        if (lastPlanContext.requiredItems.indexOf(k) === -1) lastPlanContext.requiredItems.push(k);
        const idx = lastPlanContext.excludedItems.indexOf(k);
        if (idx !== -1) lastPlanContext.excludedItems.splice(idx, 1);
      });
      pendingPlanAction = null;
      const labels = items.map(function(k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
      appendBotMsg('好的，已将【' + labels + '】加入方案。\n\n' + recommendPlanByBudget(lastPlanContext));
    } else if (isRemove) {
      items.forEach(function(k) {
        if (lastPlanContext.excludedItems.indexOf(k) === -1) lastPlanContext.excludedItems.push(k);
        const idx = lastPlanContext.requiredItems.indexOf(k);
        if (idx !== -1) lastPlanContext.requiredItems.splice(idx, 1);
      });
      pendingPlanAction = null;
      const labels = items.map(function(k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
      appendBotMsg('好的，已将【' + labels + '】从方案中去掉。\n\n' + recommendPlanByBudget(lastPlanContext));
    } else {
      appendBotMsg('请回复"加入"或"去掉"，告诉我您的选择。');
    }
  }

  /**
   * 处理 pendingQuoteAction 中等待"加入/去掉"确认的用户回复
   * @param {string} input
   */
  function handlePendingQuoteAction(input) {
    if (!pendingQuoteAction || !lastQuoteContext) { pendingQuoteAction = null; return; }
    const items = pendingQuoteAction.items;
    const ctx   = lastQuoteContext;

    const isAdd    = /加入|加上|增加|要|需要|是|对|可以|保留|好/.test(input);
    const isRemove = /去掉|不要|不用|不需要|否|不加|删除|取消|不/.test(input);

    if (isAdd && !isRemove) {
      items.forEach(function (k) {
        ctx.data['_has_' + k] = true;
        if (k === 'souvenir' && pendingQuoteAction.qty) ctx.data['_souvenirQty'] = pendingQuoteAction.qty;
        ctx.removedItems = ctx.removedItems || [];
        const idx = ctx.removedItems.indexOf(k);
        if (idx !== -1) ctx.removedItems.splice(idx, 1);
      });
      pendingQuoteAction = null;
      const labels = items.map(function (k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
      lastQuoteContext = ctx;
      appendBotMsg('好的，已将【' + labels + '】加入上一份报价。\n\n' + calcSmartQuote(ctx.data));
    } else if (isRemove) {
      items.forEach(function (k) {
        ctx.data['_has_' + k] = false;
        ctx.removedItems = ctx.removedItems || [];
        if (ctx.removedItems.indexOf(k) === -1) ctx.removedItems.push(k);
      });
      pendingQuoteAction = null;
      const labels = items.map(function (k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
      lastQuoteContext = ctx;
      appendBotMsg('好的，已将【' + labels + '】从上一份报价中移除。\n\n' + calcSmartQuote(ctx.data));
    } else {
      appendBotMsg('请回复"加入"或"去掉"，告诉我您的选择。');
    }
  }

  /**
   * 从用户输入解析预算方案约束（排除项、必选项、仅保留项、天数）
   * @param {string} input
   * @returns {{ duration: number|null, requiredItems: string[], excludedItems: string[], onlyItems: string[] }}
   */
  function parsePlanConstraints(input) {
    const result = { duration: null, requiredItems: [], excludedItems: [], onlyItems: [] };

    const dayMatch = input.match(/(\d+)\s*(?:天|日)/);
    if (dayMatch) result.duration = parseInt(dayMatch[1], 10);

    function addUniq(arr, keys) { keys.forEach(function(k) { if (arr.indexOf(k) === -1) arr.push(k); }); }

    // "只要/只保留/只做/仅需要" → onlyItems + requiredItems
    const onlyRe = /(?:只要|只保留|只做|仅需要|只需要)(.{1,60}?)(?=[，,。！!？?\n]|不要|不用|不需要|去掉|加上|增加|再加|$)/g;
    let m;
    while ((m = onlyRe.exec(input)) !== null) {
      const keys = detectQuoteItems(m[1]);
      addUniq(result.onlyItems, keys);
      addUniq(result.requiredItems, keys);
    }

    // "不要/不用/去掉" → excludedItems
    const excludeRe = /(?:不要|不用|不需要|去掉|删除|取消|不含|排除)(.{1,80}?)(?=[，,。！!？?\n]|只要|只保留|只做|加上|增加|再加|$)/g;
    while ((m = excludeRe.exec(input)) !== null) {
      const keys = detectQuoteItems(m[1]);
      addUniq(result.excludedItems, keys);
    }

    // "加上/增加/再加/加入" → requiredItems
    const addRe = /(?:加上|增加|再加|加个|加一个|算上|加入)(.{1,60}?)(?=[，,。！!？?\n]|不要|不用|只要|只保留|$)/g;
    while ((m = addRe.exec(input)) !== null) {
      addUniq(result.requiredItems, detectQuoteItems(m[1]));
    }

    // "需要/保留/我要/也要" (not 不需要) → requiredItems
    const posRe = /(?:^|[，,\s！!？?\n])(?:需要|保留|我要|也要)(.{0,60}?)(?=[，,。！!？?\n]|$)/g;
    while ((m = posRe.exec(input)) !== null) {
      addUniq(result.requiredItems, detectQuoteItems(m[1]));
    }

    // "，要X" or "要X" at start (but not 不要/只要/需要)
    const yaoRe = /(?:^|[，,])要(.{0,60}?)(?=[，,。！!？?\n]|$)/g;
    while ((m = yaoRe.exec(input)) !== null) {
      addUniq(result.requiredItems, detectQuoteItems(m[1]));
    }

    return result;
  }

  /**
   * 处理报价或预算计划的修订请求
   * @param {string} input
   */
  function handleQuoteRevision(input) {
    // ── 预算方案修订：只要 lastPlanContext 存在就优先处理，不受 lastQuoteContext 影响 ──
    if (lastPlanContext) {
      const constraints = parsePlanConstraints(input);
      const newBudget   = extractBudget(input);
      const newHcMatch  = input.match(/(?:换成|改成|改为|变成|如果是)?(\d+)\s*(?:人|位|名)/);

      // 检测是否有实质性的方案修改内容
      const hasPlanContent = !!(
        constraints.duration ||
        constraints.excludedItems.length ||
        constraints.requiredItems.length ||
        constraints.onlyItems.length ||
        newBudget ||
        (newHcMatch && /换|改|变|如果/.test(input))
      );

      if (hasPlanContent) {
        // 深拷贝上下文
        const ctx = {
          eventType:       lastPlanContext.eventType,
          headcount:       lastPlanContext.headcount,
          budget:          lastPlanContext.budget,
          duration:        lastPlanContext.duration,
          perPerson:       lastPlanContext.perPerson,
          requiredItems:   (lastPlanContext.requiredItems  || []).slice(),
          excludedItems:   (lastPlanContext.excludedItems  || []).slice(),
          onlyItems:       (lastPlanContext.onlyItems      || []).slice(),
          userConstraints: (lastPlanContext.userConstraints|| []).slice()
        };

        if (newBudget) ctx.budget = newBudget;
        if (newHcMatch && /换|改|变|如果/.test(input)) ctx.headcount = parseInt(newHcMatch[1], 10);
        if (constraints.duration) ctx.duration = constraints.duration;

        constraints.excludedItems.forEach(function(k) {
          if (ctx.excludedItems.indexOf(k) === -1) ctx.excludedItems.push(k);
          const idx = ctx.requiredItems.indexOf(k);
          if (idx !== -1) ctx.requiredItems.splice(idx, 1);
        });
        constraints.requiredItems.forEach(function(k) {
          if (ctx.requiredItems.indexOf(k) === -1) ctx.requiredItems.push(k);
          const idx = ctx.excludedItems.indexOf(k);
          if (idx !== -1) ctx.excludedItems.splice(idx, 1);
        });
        if (constraints.onlyItems.length > 0) ctx.onlyItems = constraints.onlyItems;

        // 构建前缀
        const changes = [];
        if (constraints.duration)                         changes.push('活动时长：' + constraints.duration + '天');
        if (newBudget)                                     changes.push('预算：' + formatWan(newBudget));
        if (newHcMatch && /换|改|变|如果/.test(input))    changes.push('人数：' + parseInt(newHcMatch[1], 10) + '人');
        if (constraints.excludedItems.length > 0) {
          const exLabels = constraints.excludedItems.map(function(k) { return (ITEM_ALIASES[k] || [k])[0]; }).join(' / ');
          changes.push('不包含：' + exLabels);
        }
        if (constraints.onlyItems.length > 0) {
          const onlyLabels = constraints.onlyItems.map(function(k) { return (ITEM_ALIASES[k] || [k])[0]; }).join(' / ');
          changes.push('重点保留：' + onlyLabels);
        } else if (constraints.requiredItems.length > 0) {
          const reqLabels = constraints.requiredItems.map(function(k) { return (ITEM_ALIASES[k] || [k])[0]; }).join(' / ');
          changes.push('新增必选项目：' + reqLabels);
        }

        let prefix;
        if (changes.length > 0) {
          prefix = '好的，我已按您的补充条件调整：\n';
          changes.forEach(function(c) { prefix += '· ' + c + '\n'; });
          prefix += '\n';
        } else {
          prefix = '好的，根据调整后的参数重新评估：\n\n';
        }

        appendBotMsg(prefix + recommendPlanByBudget(ctx));
        return;
      }

      // 无可解析的方案内容——检查是否有物料但意图不明确
      const items = detectQuoteItems(input);
      if (items.length > 0) {
        const hasAddIntent    = /加入|加上|增加|我要|也要|需要|保留/.test(input);
        const hasRemoveIntent = /不要|去掉|删除|取消|不用|不需要/.test(input);
        if (hasAddIntent && !hasRemoveIntent) {
          items.forEach(function(k) {
            if (lastPlanContext.requiredItems.indexOf(k) === -1) lastPlanContext.requiredItems.push(k);
            const idx = lastPlanContext.excludedItems.indexOf(k);
            if (idx !== -1) lastPlanContext.excludedItems.splice(idx, 1);
          });
          const labels = items.map(function(k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
          appendBotMsg('好的，已将【' + labels + '】加入方案。\n\n' + recommendPlanByBudget(lastPlanContext));
          return;
        } else if (hasRemoveIntent) {
          items.forEach(function(k) {
            if (lastPlanContext.excludedItems.indexOf(k) === -1) lastPlanContext.excludedItems.push(k);
            const idx = lastPlanContext.requiredItems.indexOf(k);
            if (idx !== -1) lastPlanContext.requiredItems.splice(idx, 1);
          });
          const labels = items.map(function(k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
          appendBotMsg('好的，已将【' + labels + '】从方案中去掉。\n\n' + recommendPlanByBudget(lastPlanContext));
          return;
        } else {
          // 意图不明确：设置 pendingPlanAction 等待用户确认
          pendingPlanAction = { contextType: 'plan', items: items, actionType: 'confirm_add_or_remove' };
          const labels = items.map(function(k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
          appendBotMsg('请问您是希望把【' + labels + '】加入方案，还是从方案中去掉？\n（回复"加入"或"去掉"即可）');
          return;
        }
      }

      // 无物料信息：通用提示
      appendBotMsg('好的，上一份预算方案还在记录中。请问您想调整什么？\n例如：活动天数、必选项目、排除项目或预算金额。');
      return;
    }

    // 处理具体报价修订
    const ctx = lastQuoteContext;
    if (!ctx) {
      appendBotMsg('可以的，不过我还没有上一份报价记录。请先告诉我活动类型、人数、天数和需要的服务，我再帮您估算。');
      return;
    }

    const removeRe = /不要|去掉|删除|取消|不需要|先不算|remove|exclude|不含|排除/;
    const addRe    = /加上|增加|再加|加个|加一个|算上|include|add|加入/;
    const changeRe = /换成|改成|改为|变成/;
    const isRemove = removeRe.test(input);
    // "还需要/我需要/也需要/我要/我还要" are add-intent when no remove keyword is present
    const isAdd    = addRe.test(input) || (!isRemove && /(?:还|我|也)?需要|我(?:还)?要/.test(input));

    // 人数变更
    const hcMatch = input.match(/(\d+)\s*(?:人|位|名)/);
    if (hcMatch && changeRe.test(input)) {
      ctx.data.headcount = parseInt(hcMatch[1], 10);
      const result = calcSmartQuote(ctx.data);
      lastQuoteContext = ctx;
      appendBotMsg('好的，已将人数更新为 ' + ctx.data.headcount + ' 人，重新估算如下：\n\n' + result);
      return;
    }

    // 天数变更
    const dayMatch = input.match(/(\d+)\s*(?:天|日)/);
    if (dayMatch && (changeRe.test(input) || /做.*天|改.*天/.test(input))) {
      ctx.data.duration = parseInt(dayMatch[1], 10);
      const result = calcSmartQuote(ctx.data);
      lastQuoteContext = ctx;
      appendBotMsg('好的，已将时长更新为 ' + ctx.data.duration + ' 天，重新估算如下：\n\n' + result);
      return;
    }

    const items = detectQuoteItems(input);
    if (items.length === 0) {
      // 只在没有任何可识别物料关键词时才提示
      appendBotMsg('好的，上一份报价还在记录中。请问您想调整哪个项目？（例如："去掉宣传册" / "加上摄影" / "加20份纪念品"）');
      return;
    }

    if (isRemove) {
      items.forEach(function (item) {
        ctx.data['_has_' + item] = false;
        ctx.removedItems = ctx.removedItems || [];
        if (ctx.removedItems.indexOf(item) === -1) ctx.removedItems.push(item);
      });
      const removedLabels = items.map(function (k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
      const result = calcSmartQuote(ctx.data);
      lastQuoteContext = ctx;
      appendBotMsg('好的，已将【' + removedLabels + '】从上一份报价中移除。\n\n' + result);

    } else if (isAdd) {
      items.forEach(function (item) {
        ctx.data['_has_' + item] = true;
        if (item === 'souvenir') {
          const qty = extractItemQuantity(input, 'souvenir');
          if (qty) ctx.data['_souvenirQty'] = qty;
          else if (!ctx.data['_souvenirQty']) ctx.data['_souvenirQty'] = ctx.data.headcount || 20;
        }
        ctx.removedItems = ctx.removedItems || [];
        const idx = ctx.removedItems.indexOf(item);
        if (idx !== -1) ctx.removedItems.splice(idx, 1);
      });
      const addedLabels = items.map(function (k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
      const souvenirAdded = items.indexOf('souvenir') !== -1;
      const qtyNote = souvenirAdded ? '（纪念品按 ' + (ctx.data['_souvenirQty'] || ctx.data.headcount || 20) + ' 份估算）' : '';
      const result = calcSmartQuote(ctx.data);
      lastQuoteContext = ctx;
      appendBotMsg('好的，已将【' + addedLabels + '】加入上一份报价' + qtyNote + '。\n\n' + result);

    } else {
      const labels = items.map(function (k) { return (ITEM_ALIASES[k] || [k])[0]; }).join('、');
      const souvenirQty = items.indexOf('souvenir') !== -1 ? extractItemQuantity(input, 'souvenir') : null;
      pendingQuoteAction = { items: items, qty: souvenirQty };
      appendBotMsg('请问您是希望把【' + labels + '】加入报价，还是从报价中去掉？\n（回复"加入"或"去掉"即可）');
    }
  }

  // ─────────────────────────────────────────────
  // 信息收集（无法匹配时）
  // ─────────────────────────────────────────────

  /**
   * 启动用户信息收集流程
   */
  function startCollectFlow() {
    collectState = { step: 'name', data: {} };
    appendBotMsg('抱歉，我暂时无法解答您的问题。\n为了让我们的专业顾问尽快与您联系，能否留下您的姓名？');
  }

  /**
   * 处理信息收集流程中的用户输入
   * @param {string} input
   */
  function handleCollectStep(input) {
    if (collectState.step === 'name') {
      collectState.data.name = input.trim();
      collectState.step = 'contact';
      appendBotMsg('谢谢，' + collectState.data.name + '！请留下您的联系方式（电话或微信）：');
    } else if (collectState.step === 'contact') {
      collectState.data.contact = input.trim();
      // 存入 localStorage
      saveLeadToStorage(collectState.data);
      collectState = null;
      missCount = 0;
      appendBotMsg(
        '已收到您的信息，我们会尽快与您联系！\n' +
        '如有急需，也可直接拨打：' + COMPANY_PHONE
      );
    }
  }

  /**
   * 将潜在客户信息存入 localStorage
   * @param {{ name: string, contact: string }} lead
   */
  function saveLeadToStorage(lead) {
    try {
      const key = 'hj_leads';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push({
        name:    lead.name,
        contact: lead.contact,
        time:    new Date().toLocaleString('zh-CN'),
      });
      localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
      console.warn('[HJ Chatbot] localStorage 写入失败', e);
    }
  }

  // ─────────────────────────────────────────────
  // 消息处理主入口
  // ─────────────────────────────────────────────

  /**
   * 处理用户发送的消息
   * @param {string} input
   */
  function handleUserMessage(input) {
    const text = input.trim();
    if (!text) return;

    appendUserMsg(text);

    // ── P1：报价流程进行中 ──
    if (quoteState !== null) {
      handleSmartQuoteStep(text);
      return;
    }

    // ── P2：预算推荐多轮流程进行中 ──
    if (budgetState !== null) {
      handleBudgetPlanStep(text);
      return;
    }

    // ── P3：待确认物料动作（pendingPlanAction / pendingQuoteAction）──
    if (pendingPlanAction !== null) {
      handlePendingPlanAction(text);
      return;
    }
    if (pendingQuoteAction !== null) {
      handlePendingQuoteAction(text);
      return;
    }

    // ── P4：信息收集流程进行中 ──
    if (collectState !== null) {
      handleCollectStep(text);
      return;
    }

    // ── P4b：检测意图 ──
    const intent    = detectIntent(text);
    const eventType = detectEventType(text);

    // ── P5a：公司介绍查询 → 直接回答（高优先级，先于报价和预算流程） ──
    if (intent.has('company_profile') && !intent.has('budget_plan')) {
      missCount = 0;
      appendBotMsg(getCompanyProfileAnswer());
      return;
    }

    // ── P5b：服务范围查询 → 直接回答（高优先级，先于报价和预算流程） ──
    if (intent.has('service_scope') && !intent.has('budget_plan') && !intent.has('quotation')) {
      missCount = 0;
      appendBotMsg(eventType ? getEventCapabilityAnswer(eventType) : getServiceScopeAnswer());
      return;
    }

    // ── P6：预算推荐查询（优先于普通报价流程，否则"预算"关键词会触发报价流程） ──
    if (intent.has('budget_plan')) {
      missCount = 0;
      startBudgetPlanFlow(text);
      return;
    }

    // ── P7：上下文修订（报价或预算计划的延续，必须在新报价流程之前） ──
    if ((lastQuoteContext || lastPlanContext) && detectQuoteRevisionIntent(text)) {
      missCount = 0;
      handleQuoteRevision(text);
      return;
    }

    // ── P8：预约时间意图 → 直接回答 ──
    if (intent.has('booking_time')) {
      missCount = 0;
      appendBotMsg(getBookingTimeAnswer(eventType));
      return;
    }

    // ── P8b：报价意图或服务需求描述 → 启动智能报价流程 ──
    if (intent.has('quotation') || isQuoteTrigger(text) || hasServiceDescription(text)) {
      missCount = 0;
      startSmartQuoteFlow(text);
      return;
    }

    // ── P8：加权 QA 知识库匹配 ──
    const answer = findBestAnswer(text, intent);
    if (answer) {
      missCount = 0;
      appendBotMsg(answer);
      return;
    }

    // ── P9：活动相关但未能匹配 → 引导澄清 ──
    if (isEventRelated(text)) {
      missCount = 0;
      appendBotMsg(
        '我理解您是在咨询活动/会议相关需求。为了更准确地回答，您可以补充以下信息吗：\n' +
        '· 活动类型（学术会议 / 展览 / 年会 / 发布会）\n' +
        '· 预计人数和时长\n' +
        '· 需要哪些物料或服务（如宣传册、摄影、茶歇、现场搭建等）\n\n' +
        '也可以直接问我具体问题，例如"学术会议需要哪些物料"或"展览板大概多少钱"。'
      );
      return;
    }

    // ── P9b：用户明确表示无需调整 / 满意（在有历史上下文时）──
    if ((lastPlanContext || lastQuoteContext) &&
        /不(?:需要)?调整|不(?:用|要)调整|就这样|先这样|暂时不|好了|没问题|不变了|不需要了|够了|可以了|满意/.test(text)) {
      missCount = 0;
      appendBotMsg('好的，方案已记录，随时可以继续调整。如需进一步咨询，欢迎联系我们的顾问！');
      return;
    }

    // ── P9c：包含公司/服务关键词但未被上方规则捕获 → 兜底回答，避免进入联系收集 ──
    if (/公司|服务|业务|介绍|做什么|能做|可以做/.test(text)) {
      missCount = 0;
      appendBotMsg(/服务|业务|做什么|能做|可以做/.test(text) ? getServiceScopeAnswer() : getCompanyProfileAnswer());
      return;
    }

    // ── P10：完全无关 → 联系信息或引导 ──
    missCount++;
    if (missCount >= MAX_MISS_BEFORE_CONTACT) {
      missCount = 0;
      appendBotMsg(
        '抱歉，我多次未能解答您的问题。\n建议您直接联系我们的专业团队：\n' +
        '📞 电话：' + COMPANY_PHONE + '\n' +
        '📧 邮箱：' + COMPANY_EMAIL + '\n' +
        '我们将竭诚为您服务！'
      );
    } else {
      startCollectFlow();
    }
  }

  // ─────────────────────────────────────────────
  // 欢迎语
  // ─────────────────────────────────────────────

  /**
   * 发送开场欢迎消息
   */
  function sendWelcome() {
    appendBotMsg(
      '您好！欢迎来到上海和珈文化传媒有限公司 👋\n' +
      '我是您的专属顾问小和，可以帮您了解：\n' +
      '· 公司服务与案例\n' +
      '· 活动策划与执行\n' +
      '· 费用报价估算\n\n' +
      '请问有什么可以帮您的？'
    );
  }

  // ─────────────────────────────────────────────
  // 窗口开关控制
  // ─────────────────────────────────────────────

  /**
   * 打开聊天窗口
   */
  function openChat() {
    const win = document.getElementById('hj-chat-window');
    const btn = document.getElementById('hj-chat-btn');
    if (!win || !btn) return;
    isOpen = true;
    win.classList.add('hj-open');
    btn.classList.add('hj-active');
    // 首次打开发送欢迎语
    const list = document.getElementById('hj-messages');
    if (list && list.children.length === 0) {
      sendWelcome();
    }
    // 聚焦输入框
    setTimeout(function () {
      const input = document.getElementById('hj-input');
      if (input) input.focus();
    }, 300);
  }

  /**
   * 关闭聊天窗口
   */
  function closeChat() {
    const win = document.getElementById('hj-chat-window');
    const btn = document.getElementById('hj-chat-btn');
    if (!win || !btn) return;
    isOpen = false;
    win.classList.remove('hj-open');
    btn.classList.remove('hj-active');
  }

  /**
   * 切换聊天窗口开关状态
   */
  function toggleChat() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  // ─────────────────────────────────────────────
  // 事件绑定
  // ─────────────────────────────────────────────

  /**
   * 绑定所有 DOM 事件
   */
  function bindEvents() {
    // 浮动按钮点击
    document.getElementById('hj-chat-btn').addEventListener('click', toggleChat);

    // 关闭按钮
    document.getElementById('hj-chat-close').addEventListener('click', function (e) {
      e.stopPropagation();
      closeChat();
    });

    // 发送按钮
    document.getElementById('hj-send-btn').addEventListener('click', function () {
      const input = document.getElementById('hj-input');
      if (!input) return;
      const val = input.value;
      input.value = '';
      handleUserMessage(val);
    });

    // 回车发送
    document.getElementById('hj-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const val = this.value;
        this.value = '';
        handleUserMessage(val);
      }
    });
  }

  // ─────────────────────────────────────────────
  // 初始化入口
  // ─────────────────────────────────────────────

  /**
   * 主初始化函数：构建 DOM → 绑定事件 → 加载知识库
   */
  function init() {
    buildDOM();
    bindEvents();
    loadQA().then(function () {
      console.log('[HJ Chatbot] 知识库加载完成，共 ' + qaData.length + ' 条问答。');
    });
  }

  // 等待 DOM 就绪后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
