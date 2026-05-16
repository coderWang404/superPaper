const BUILTIN_SKILLS = [
  {
    id: 'latex-compile-debug',
    name: 'latex-compile-debug',
    displayName: 'LaTeX 编译错误诊断',
    description: '分析 LaTeX 编译错误并提出最小修复步骤。',
    modelInvocable: true,
    keywords: ['compile', 'error', 'latex', '编译', '报错', '错误'],
    requiredTools: [
      'project.read_file',
      'project.search',
      'compile.get_last_result',
      'patch.propose',
    ],
    content:
      '当用户要求修复编译错误时，先读取最近编译结果，再读取错误附近文件。优先提出最小补丁，不要重写整篇论文。',
  },
  {
    id: 'latex-ref-bib-fix',
    name: 'latex-ref-bib-fix',
    displayName: '引用与参考文献修复',
    description: '检查 citation、bib key、label/ref 问题。',
    modelInvocable: true,
    keywords: ['cite', 'citation', 'bib', 'reference', '引用', '参考文献'],
    requiredTools: ['project.get_map', 'project.search', 'project.read_file'],
    content:
      '处理引用问题时，先用 project.get_map 查看 bib keys、labels 和 refs，再定位缺失或重复项。',
  },
  {
    id: 'academic-polish',
    name: 'academic-polish',
    displayName: '学术英文润色',
    description: '润色当前选择或指定文件，保留 LaTeX 命令和数学表达。',
    modelInvocable: true,
    keywords: ['polish', 'rewrite', 'english', '润色', '改写', '英文'],
    requiredTools: ['editor.get_selection', 'project.read_file'],
    content:
      '润色时保持 LaTeX 命令、引用、label、数学环境和占位符不变。默认只处理用户指定范围。',
  },
  {
    id: 'paper-structure-review',
    name: 'paper-structure-review',
    displayName: '论文结构审阅',
    description: '检查摘要、引言、方法、实验、结论结构。',
    modelInvocable: true,
    keywords: ['structure', 'abstract', 'introduction', '结构', '摘要', '引言'],
    requiredTools: ['project.get_map', 'project.read_file'],
    content:
      '做结构审阅时，先建立章节地图，再按问题、贡献、方法、实验、结论检查逻辑链。',
  },
  {
    id: 'project-cleanup',
    name: 'project-cleanup',
    displayName: '项目清理检查',
    description: '查找未引用图片、孤立 bib 条目、重复 label 等问题。',
    modelInvocable: true,
    keywords: ['cleanup', 'unused', 'duplicate', '清理', '未使用', '重复'],
    requiredTools: ['project.get_map', 'project.search', 'project.list_files'],
    content:
      '项目清理只报告可确认的问题。删除或重命名必须走补丁审批，不能直接执行。',
  },
]

export function listBuiltinSkills() {
  return BUILTIN_SKILLS.map(publicSkill)
}

export function selectSkillsForTask(task, { maxSkills = 3 } = {}) {
  const normalizedTask = String(task || '').toLowerCase()
  const scored = BUILTIN_SKILLS.map(skill => ({
    skill,
    score: skill.keywords.reduce((score, keyword) => {
      return normalizedTask.includes(keyword.toLowerCase()) ? score + 1 : score
    }, 0),
  }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxSkills)

  return scored.map(item => item.skill)
}

export function formatSkillsForPrompt(skills) {
  return skills
    .map(skill => {
      return [
        `### Skill: ${skill.name}`,
        `Description: ${skill.description}`,
        `Required tools: ${skill.requiredTools.join(', ')}`,
        skill.content,
      ].join('\n')
    })
    .join('\n\n')
}

function publicSkill(skill) {
  return {
    id: skill.id,
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    modelInvocable: skill.modelInvocable,
    requiredTools: skill.requiredTools,
  }
}
