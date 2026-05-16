import { expect } from 'vitest'

import {
  formatSkillsForPrompt,
  listBuiltinSkills,
  selectSkillsForTask,
} from '../../../../app/src/Features/AiAgent/AiAgentSkillManager.mjs'
import { listBuiltinPlugins } from '../../../../app/src/Features/AiAgent/AiAgentPluginManager.mjs'

describe('AiAgentSkillManager', function () {
  it('lists built-in skills without full prompt content', function () {
    const skills = listBuiltinSkills()

    expect(skills.map(skill => skill.id)).to.include('latex-compile-debug')
    expect(skills[0]).to.not.have.property('content')
  })

  it('selects skills by task keywords', function () {
    const skills = selectSkillsForTask('修复 LaTeX 编译错误 and cite problems')

    expect(skills.map(skill => skill.id)).to.deep.equal([
      'latex-compile-debug',
      'latex-ref-bib-fix',
    ])
  })

  it('formats selected skills for model context', function () {
    const [skill] = selectSkillsForTask('polish academic english')
    const prompt = formatSkillsForPrompt([skill])

    expect(prompt).to.include('### Skill: academic-polish')
    expect(prompt).to.include('Required tools:')
  })

  it('lists the built-in latex plugin manifest', function () {
    const plugins = listBuiltinPlugins()

    expect(plugins).to.deep.include({
      id: 'latex-core',
      name: 'latex-core',
      version: '1.0.0',
      displayName: 'LaTeX 核心 Agent 能力包',
      description: '内置 LaTeX 编译诊断、引用修复、学术润色和项目清理 skills。',
      enabled: true,
      skills: [
        'latex-compile-debug',
        'latex-ref-bib-fix',
        'academic-polish',
        'paper-structure-review',
        'project-cleanup',
      ],
      toolPresets: ['latex-readonly', 'compile-check'],
    })
  })
})
