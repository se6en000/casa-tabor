import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSetting, setSetting } from '../lib/settingsStore'

export interface AssigneeLearningState {
  keywordRules: Record<string, string> // e.g. { "4th grade": "Liv", "strings": "Emme", "kindergarten": "Owen" }
  domainRules: Record<string, string>  // e.g. { "palmbeachschools.org": "Liv" }
}

const DEFAULT_LEARNING: AssigneeLearningState = {
  keywordRules: {},
  domainRules: {},
}

export function useActionAssigneeLearning() {
  const qc = useQueryClient()

  const { data: learning = DEFAULT_LEARNING } = useQuery<AssigneeLearningState>({
    queryKey: ['action-assignee-learning'],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const { data, error } = await getSetting<AssigneeLearningState>('action_assignee_learning')

        if (error) {
          console.warn('Could not fetch action assignee learning, fallback to default:', error)
          return DEFAULT_LEARNING
        }
        return data || DEFAULT_LEARNING
      } catch {
        return DEFAULT_LEARNING
      }
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (nextLearning: AssigneeLearningState) => {
      const { error } = await setSetting('action_assignee_learning', nextLearning)
      if (error) console.warn('Could not persist assignee learning:', error)
      return nextLearning
    },
    onSuccess: (nextLearning) => {
      qc.setQueryData(['action-assignee-learning'], nextLearning)
    },
  })

  const learnAssignee = (patternOrTitle: string, memberName: string, domain?: string | null) => {
    if (!memberName || !patternOrTitle) return

    const normalizedPattern = patternOrTitle.toLowerCase().trim()
    const nextLearning: AssigneeLearningState = {
      keywordRules: {
        ...learning.keywordRules,
        [normalizedPattern]: memberName,
      },
      domainRules: {
        ...learning.domainRules,
        ...(domain ? { [domain.toLowerCase().trim()]: memberName } : {}),
      },
    }

    saveMutation.mutate(nextLearning)
  }

  const getLearnedAssignee = (text: string, domain?: string | null): string | null => {
    if (!text) return null
    const lower = text.toLowerCase()

    // 1. Check keyword rules
    for (const [kw, member] of Object.entries(learning.keywordRules)) {
      if (lower.includes(kw)) return member
    }

    // 2. Check domain rules
    if (domain) {
      const domLower = domain.toLowerCase()
      for (const [dom, member] of Object.entries(learning.domainRules)) {
        if (domLower.includes(dom)) return member
      }
    }

    return null
  }

  return {
    learning,
    learnAssignee,
    getLearnedAssignee,
  }
}
