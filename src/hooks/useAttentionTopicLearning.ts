import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PrepItem } from '../types'
import { attentionLearningSignature, type AttentionTopicRule } from '../utils/attentionTopics'

export function useAttentionTopicLearning() {
  const queryClient = useQueryClient()
  const { data: rules = [] } = useQuery<AttentionTopicRule[]>({
    queryKey: ['attention-topic-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attention_topic_rules')
        .select('signature, topic_key')
      if (error) throw error
      return data
    },
    staleTime: 60_000,
  })

  const saveRules = useMutation({
    mutationFn: async (rows: AttentionTopicRule[]) => {
      const { error } = await supabase
        .from('attention_topic_rules')
        .upsert(rows, { onConflict: 'signature' })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attention-topic-rules'] }),
  })

  async function learnTopic(items: PrepItem[]) {
    const topicKey = `learned:${crypto.randomUUID()}`
    await saveRules.mutateAsync(items.map((item) => ({
      signature: attentionLearningSignature(item),
      topic_key: topicKey,
    })))
  }

  async function separateItem(item: PrepItem) {
    await saveRules.mutateAsync([{
      signature: attentionLearningSignature(item),
      topic_key: `separate:${crypto.randomUUID()}`,
    }])
  }

  return { rules, learnTopic, separateItem, isSaving: saveRules.isPending }
}
