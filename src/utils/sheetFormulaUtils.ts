import type { Sheet } from '@/types'
import { cellKey } from './cellUtils'
import { evaluateFormula, getFormulaDependencies } from './formulaEngine'

function buildDependencyGraph(cells: Sheet['cells']) {
  const formulaKeys = Object.keys(cells).filter((key) => Boolean(cells[key].formula))
  const formulaSet = new Set(formulaKeys)
  const dependenciesByKey = new Map<string, string[]>()
  const reverseDependents = new Map<string, string[]>()

  for (const key of formulaKeys) {
    const dependencies = getFormulaDependencies(`=${cells[key].formula || ''}`)
    dependenciesByKey.set(key, dependencies)

    for (const dependency of dependencies) {
      const dependents = reverseDependents.get(dependency)
      if (dependents) {
        dependents.push(key)
      } else {
        reverseDependents.set(dependency, [key])
      }
    }
  }

  return { formulaKeys, formulaSet, dependenciesByKey, reverseDependents }
}

function getImpactedFormulaKeys(
  formulaKeys: string[],
  formulaSet: Set<string>,
  reverseDependents: Map<string, string[]>,
  changedKeys?: Iterable<string>,
) {
  if (!changedKeys) {
    return new Set(formulaKeys)
  }

  const queue: string[] = []
  const visited = new Set<string>()
  const impacted = new Set<string>()

  for (const key of changedKeys) {
    if (!visited.has(key)) {
      visited.add(key)
      queue.push(key)
    }
    if (formulaSet.has(key)) {
      impacted.add(key)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const dependents = reverseDependents.get(current)
    if (!dependents) continue

    for (const dependent of dependents) {
      impacted.add(dependent)
      if (!visited.has(dependent)) {
        visited.add(dependent)
        queue.push(dependent)
      }
    }
  }

  return impacted
}

export function recalculateSheetFormulas(sheet: Sheet, changedKeys?: Iterable<string>): Sheet {
  const cells = { ...sheet.cells }
  const { formulaKeys, formulaSet, dependenciesByKey, reverseDependents } = buildDependencyGraph(cells)

  if (formulaKeys.length === 0) {
    return sheet
  }

  const impactedKeys = getImpactedFormulaKeys(
    formulaKeys,
    formulaSet,
    reverseDependents,
    changedKeys,
  )

  if (impactedKeys.size === 0) {
    return sheet
  }

  const unresolved = new Set(impactedKeys)
  const pendingDependencies = new Map<string, number>()
  const dependentsWithinImpact = new Map<string, string[]>()

  const evaluateCell = (key: string, blockedKeys: Set<string>) => {
    const cell = cells[key]
    if (!cell?.formula) return

    const getCellValue = (row: number, col: number) => {
      const targetKey = cellKey(row, col)
      const target = cells[targetKey]
      if (!target) return ''

      if (target.formula && blockedKeys.has(targetKey)) {
        return target.value || ''
      }

      if (target.computedValue !== undefined) return target.computedValue
      return target.value || ''
    }

    const result = evaluateFormula(`=${cell.formula}`, getCellValue)
    const computed = Array.isArray(result) ? String(result) : result as string | number | boolean | null
    cells[key] = { ...cell, computedValue: computed }
  }

  for (const key of impactedKeys) {
    const dependencies = dependenciesByKey.get(key) || []
    let pendingCount = 0

    for (const dependency of dependencies) {
      if (!formulaSet.has(dependency) || !impactedKeys.has(dependency)) continue
      pendingCount += 1
      const dependents = dependentsWithinImpact.get(dependency)
      if (dependents) {
        dependents.push(key)
      } else {
        dependentsWithinImpact.set(dependency, [key])
      }
    }

    pendingDependencies.set(key, pendingCount)
  }

  const readyQueue = Array.from(impactedKeys).filter((key) => (pendingDependencies.get(key) || 0) === 0)

  while (readyQueue.length > 0) {
    const key = readyQueue.shift()!
    evaluateCell(key, unresolved)
    unresolved.delete(key)

    const dependents = dependentsWithinImpact.get(key)
    if (!dependents) continue

    for (const dependent of dependents) {
      const nextPendingCount = (pendingDependencies.get(dependent) || 0) - 1
      pendingDependencies.set(dependent, nextPendingCount)
      if (nextPendingCount === 0) {
        readyQueue.push(dependent)
      }
    }
  }

  if (unresolved.size > 0) {
    let changed = true
    const cyclicKeys = Array.from(unresolved)

    for (let pass = 0; pass < cyclicKeys.length && changed; pass++) {
      changed = false

      for (const key of cyclicKeys) {
        const previous = cells[key]?.computedValue
        evaluateCell(key, new Set())
        if (cells[key]?.computedValue !== previous) {
          changed = true
        }
      }
    }

    for (const key of unresolved) {
      cells[key] = { ...cells[key], computedValue: '#CYCLE!' }
    }
  }

  return { ...sheet, cells }
}
