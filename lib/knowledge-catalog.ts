export const UNKNOWN_SUBJECT = "历史记录知识点";

type OutlineSection = {
  section: string;
  topics: string[];
};

type SubjectOutline = {
  subject: string;
  sections: OutlineSection[];
};

// Based on the April 9, 2026 official outline published by China's Ministry of Finance.
const SUBJECT_OUTLINE: SubjectOutline[] = [
  {
    subject: "中级会计实务",
    sections: [
      {
        section: "总论",
        topics: [
          "会计职业道德概述",
          "会计法规制度体系概述",
          "财务报告目标、会计要素和会计信息质量要求",
          "可持续信息披露"
        ]
      },
      {
        section: "存货",
        topics: ["存货的确认和初始计量", "存货的期末计量"]
      },
      {
        section: "固定资产",
        topics: ["固定资产的确认和初始计量", "固定资产的后续计量", "固定资产的处置"]
      },
      {
        section: "无形资产",
        topics: [
          "无形资产的确认和初始计量",
          "内部研究开发支出的确认和计量",
          "无形资产的后续计量",
          "无形资产的处置"
        ]
      },
      {
        section: "投资性房地产",
        topics: [
          "投资性房地产及其范围",
          "投资性房地产的确认和初始计量",
          "投资性房地产的后续计量",
          "投资性房地产的转换和处置"
        ]
      },
      {
        section: "长期股权投资和合营安排",
        topics: ["长期股权投资的范围和初始计量", "长期股权投资的后续计量", "合营安排"]
      },
      {
        section: "资产减值",
        topics: ["资产减值的范围及迹象", "资产可收回金额的计量和减值损失的确定", "资产组减值的处理"]
      },
      {
        section: "金融资产和金融负债",
        topics: ["金融资产和金融负债的分类", "金融资产和金融负债的计量"]
      },
      {
        section: "职工薪酬",
        topics: ["职工薪酬的范围及分类", "短期薪酬的确认和计量", "离职后福利", "辞退福利和其他长期职工福利的确认和计量"]
      },
      {
        section: "股份支付",
        topics: ["股份支付的主要环节及类型", "股份支付的确认和计量"]
      },
      {
        section: "借款费用",
        topics: ["借款费用的范围", "借款费用资本化的确认", "借款费用资本化金额的计量"]
      },
      {
        section: "或有事项",
        topics: ["或有事项及其特征", "或有事项的确认和计量", "或有事项账务处理原则的应用"]
      },
      {
        section: "收入",
        topics: ["收入的范围及确认和计量的原则", "收入的确认和计量的步骤", "合同成本", "特定交易的会计处理"]
      },
      {
        section: "政府补助",
        topics: ["政府补助的特征及分类", "政府补助的会计处理"]
      },
      {
        section: "非货币性资产交换",
        topics: ["非货币性资产交换的认定", "非货币性资产交换的确认和计量"]
      },
      {
        section: "债务重组",
        topics: ["债务重组的定义及方式", "债务重组的会计处理"]
      },
      {
        section: "所得税费用",
        topics: ["计税基础与暂时性差异", "递延所得税负债和递延所得税资产的确认与计量", "所得税费用的确认和计量"]
      },
      {
        section: "外币折算",
        topics: ["外币交易的会计处理", "外币财务报表的折算"]
      },
      {
        section: "租赁",
        topics: ["租赁的识别、分拆与合并", "承租人会计处理", "出租人会计处理", "特殊租赁业务的会计处理"]
      },
      {
        section: "持有待售的非流动资产、处置组和终止经营",
        topics: ["持有待售的非流动资产、处置组", "终止经营"]
      },
      {
        section: "企业合并与合并财务报表",
        topics: ["企业合并", "合并财务报表的编制"]
      },
      {
        section: "会计政策、会计估计变更和差错更正",
        topics: ["会计政策及其变更", "会计估计及其变更", "会计政策变更与会计估计变更的划分", "前期差错及其更正"]
      },
      {
        section: "资产负债表日后事项",
        topics: ["资产负债表日后事项及其内容", "资产负债表日后调整事项", "资产负债表日后非调整事项"]
      },
      {
        section: "政府会计",
        topics: ["政府会计概述", "行政事业单位特定业务的会计核算"]
      },
      {
        section: "民间非营利组织会计",
        topics: ["民间非营利组织会计概述", "民间非营利组织特定业务的会计核算"]
      }
    ]
  },
  {
    subject: "财务管理",
    sections: [
      {
        section: "总论",
        topics: ["企业组织形式", "财务管理内容", "财务管理目标", "财务管理原则", "财务管理环境"]
      },
      {
        section: "财务管理基础",
        topics: ["货币时间价值", "风险与收益", "资本资产定价模型", "成本性态分析", "本量利分析"]
      },
      {
        section: "预算管理",
        topics: ["预算管理的主要内容", "预算编制方法与程序", "预算编制", "预算执行与考核"]
      },
      {
        section: "筹资管理",
        topics: ["筹资管理概述", "债务筹资", "股权筹资", "衍生工具筹资", "资本成本", "杠杆效应", "资本结构"]
      },
      {
        section: "投资管理",
        topics: ["投资管理概述", "投资项目财务评价指标", "项目投资管理", "证券投资管理"]
      },
      {
        section: "营运资金管理",
        topics: ["营运资金管理策略", "现金管理", "应收账款管理", "存货管理", "流动负债管理"]
      },
      {
        section: "成本管理",
        topics: ["成本管理概述", "本量利分析与应用", "标准成本控制与分析", "作业成本与责任成本"]
      },
      {
        section: "收入与分配管理",
        topics: ["销售预测分析", "产品定价方法", "收入管理", "纳税管理", "分配管理"]
      },
      {
        section: "财务分析与评价",
        topics: ["财务分析与评价概述", "偿债能力分析", "营运能力分析", "盈利能力分析", "发展能力分析", "上市公司特殊财务分析指标", "财务综合绩效评价"]
      }
    ]
  },
  {
    subject: "经济法",
    sections: [
      {
        section: "总论",
        topics: ["法律体系", "法律行为与代理", "仲裁", "民事诉讼"]
      },
      {
        section: "公司法律制度",
        topics: [
          "公司法律制度概述",
          "公司的登记管理",
          "有限责任公司",
          "股份有限公司",
          "国家出资公司组织机构的特别规定",
          "公司董事、监事、高级管理人员的资格和义务",
          "公司股票和公司债券",
          "公司财务会计",
          "公司合并、分立、增资、减资",
          "公司解散和清算"
        ]
      },
      {
        section: "合伙企业法律制度",
        topics: ["合伙企业法律制度概述", "普通合伙企业", "有限合伙企业", "合伙企业的解散和清算"]
      },
      {
        section: "物权法律制度",
        topics: ["物权法律制度概述", "物权变动", "所有权", "用益物权", "担保物权"]
      },
      {
        section: "合同法律制度",
        topics: [
          "合同订立",
          "合同效力",
          "合同履行",
          "合同保全",
          "合同担保",
          "合同变更和转让",
          "合同权利义务终止",
          "违约责任",
          "买卖合同",
          "赠与合同",
          "借款合同",
          "保证合同",
          "租赁合同"
        ]
      },
      {
        section: "金融法律制度",
        topics: ["票据法律制度", "证券法律制度", "保险法律制度", "信托法律制度"]
      },
      {
        section: "财政法律制度",
        topics: ["预算法律制度", "国有资产管理法律制度", "政府采购法律制度", "增值税法律制度", "企业所得税法律制度", "合同法律制度"]
      }
    ]
  }
];

function flattenSections(sections: OutlineSection[]) {
  return sections.flatMap(({ section, topics }) => [section, ...topics.map((topic) => `${section} / ${topic}`)]);
}

export const SUBJECT_CATALOG: Array<{ subject: string; topics: string[] }> = SUBJECT_OUTLINE.map(({ subject, sections }) => ({
  subject,
  topics: flattenSections(sections)
}));

export function findSubjectByKnowledgePoint(knowledgePoint?: string) {
  if (!knowledgePoint) {
    return null;
  }

  for (const item of SUBJECT_CATALOG) {
    if (item.topics.includes(knowledgePoint)) {
      return item.subject;
    }
  }

  return null;
}

export function getSubjectCatalog(extraKnowledgePoint?: string) {
  const matchedSubject = findSubjectByKnowledgePoint(extraKnowledgePoint);

  if (!extraKnowledgePoint || matchedSubject) {
    return SUBJECT_CATALOG;
  }

  return [
    ...SUBJECT_CATALOG,
    {
      subject: UNKNOWN_SUBJECT,
      topics: [extraKnowledgePoint]
    }
  ];
}

export function getTopicsForSubject(subject: string, extraKnowledgePoint?: string) {
  if (subject === UNKNOWN_SUBJECT && extraKnowledgePoint) {
    return [extraKnowledgePoint];
  }

  const topics = getSubjectCatalog(extraKnowledgePoint).find((item) => item.subject === subject)?.topics ?? [];
  return [...topics];
}

export function getChapterCatalog() {
  return SUBJECT_OUTLINE.flatMap(({ subject, sections }) =>
    sections.map(({ section, topics }, index) => ({
      subject,
      chapterName: section,
      topics: [...topics],
      sortOrder: index + 1
    }))
  );
}
