import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Mic,
  Send,
  Sparkles,
  X,
  ChefHat,
} from 'lucide-react'
import { Button, Card, Chip, IconButton } from '../ui'
import { useFieldDictation } from '../../hooks/useFieldDictation'
import { supabase } from '../../lib/supabase'
import { resolveCulinaryQuery, type RecipeCookingContext } from '../../lib/culinaryKnowledge'
import { cn } from '../../utils/cn'

export interface SousChefMessage {
  id: string
  sender: 'chef' | 'user'
  text: string
  timestamp: string
  actionChip?: {
    label: string
    type: 'timer' | 'broadcast' | 'substitution'
    payload?: string | number
  }
}

interface KitchenSousChefSidecarProps {
  recipeName: string
  currentStepIndex: number
  totalSteps: number
  currentStepInstruction?: string
  allSteps?: Array<{ stepNumber: number; instruction: string }>
  ingredients?: Array<{ id: string; name: string; qty?: string | null; rawText?: string }>
  recipeScale?: string
  onAddTimer: (label: string, seconds: number) => void
  onStepChange?: (stepIndex: number) => void
  onChangeScale?: (scale: string) => void
  onClose?: () => void
  className?: string
}

export default function KitchenSousChefSidecar({
  recipeName,
  currentStepIndex,
  totalSteps,
  currentStepInstruction = '',
  allSteps = [],
  ingredients = [],
  recipeScale = '1',
  onAddTimer,
  onStepChange: _onStepChange,
  onChangeScale: _onChangeScale,
  onClose,
  className,
}: KitchenSousChefSidecarProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<SousChefMessage[]>([
    {
      id: 'init-1',
      sender: 'chef',
      text: `👋 Chef Casa here! I'm loaded with all ${totalSteps} steps and full ingredients for ${recipeName}.\n\nTap the mic or ask below about substitutions, pan temperatures, meat doneness, or timers!`,
      timestamp: 'Just now',
    },
  ])
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Contextual Dynamic Quick Chips derived from current step text & ingredients
  const stepQuickChips = useMemo(() => {
    const text = currentStepInstruction.toLowerCase()
    const chips: Array<{ label: string; prompt: string; action?: { type: 'timer'; label: string; seconds: number } }> = []

    // Timer chips detection
    const minuteMatch = text.match(/(\d+)\s*(?:to\s*\d+\s*)?(?:min|minute)s?/i)
    const secondMatch = text.match(/(\d+)\s*(?:to\s*\d+\s*)?(?:sec|second)s?/i)
    if (minuteMatch) {
      const mins = Number(minuteMatch[1])
      chips.push({
        label: `⏱️ Set ${mins}m Timer`,
        prompt: `Set a ${mins} minute timer for this step`,
        action: { type: 'timer', label: `Step ${currentStepIndex + 1} (${mins}m)`, seconds: mins * 60 },
      })
    } else if (secondMatch) {
      const secs = Number(secondMatch[1])
      chips.push({
        label: `⏱️ Set ${secs}s Timer`,
        prompt: `Set a ${secs} second timer for this step`,
        action: { type: 'timer', label: `Step ${currentStepIndex + 1} (${secs}s)`, seconds: secs },
      })
    }

    // Common cooking inquiries
    if (text.includes('garlic') || text.includes('sauté') || text.includes('skillet') || text.includes('sear') || text.includes('pan')) {
      chips.push({
        label: '🔥 Pan temp check',
        prompt: `How hot should my pan be for step ${currentStepIndex + 1}?`,
      })
      chips.push({
        label: '👁️ Doneness cues',
        prompt: `How do I know when the ingredients in step ${currentStepIndex + 1} are perfectly cooked?`,
      })
    }

    if (text.includes('wine') || text.includes('alcohol')) {
      chips.push({
        label: '🍷 White wine substitute',
        prompt: 'What can I use instead of white wine?',
      })
    }

    if (text.includes('chicken') || text.includes('poultry') || text.includes('meat') || text.includes('steak') || text.includes('salmon')) {
      chips.push({
        label: '🌡️ Internal temp check',
        prompt: 'What safe internal temperature should I cook this to?',
      })
    }

    // General fallback quick chips
    chips.push({
      label: '🔄 Ingredient substitutions',
      prompt: 'What can I substitute if I am missing something in this recipe?',
    })

    chips.push({
      label: '🔔 Call Family: Dinner in 10m',
      prompt: 'Announce to the family that dinner will be ready in 10 minutes',
    })

    return chips.slice(0, 4)
  }, [currentStepInstruction, currentStepIndex])

  // Context bundle for instant culinary engine & edge function
  const cookingContext = useMemo<RecipeCookingContext>(() => ({
    recipeName,
    currentStepIndex,
    totalSteps,
    currentStepInstruction,
    allSteps,
    ingredients,
    recipeScale,
  }), [recipeName, currentStepIndex, totalSteps, currentStepInstruction, allSteps, ingredients, recipeScale])

  const handleSendMessage = useCallback(async (textToSend?: string): Promise<string> => {
    const query = (textToSend || input).trim()
    if (!query) return ''

    const userMsg: SousChefMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: 'Now',
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    // 1. Check instant local culinary knowledge engine
    const instantAnswer = resolveCulinaryQuery(query, cookingContext)

    let finalResponse = ''

    if (instantAnswer) {
      finalResponse = instantAnswer
      await new Promise((r) => setTimeout(r, 200))
    } else {
      // 2. Query AI backend with full culinary context
      try {
        const ingredientsList = ingredients.map((i) => `${i.name}${i.qty ? ` (${i.qty})` : ''}`).join(', ')
        const stepsList = allSteps.map((s) => `Step ${s.stepNumber}: ${s.instruction}`).join('\n')

        const requestBody = {
          messages: [
            {
              role: 'system',
              content: `You are Chef Casa, an expert culinary sous chef assisting a home cook in the kitchen. 
The cook is currently making: "${recipeName}" (Step ${currentStepIndex + 1} of ${totalSteps}).
Scale: ${recipeScale}x.
Ingredients: ${ingredientsList}.
Steps:
${stepsList}
Current active step: "${currentStepInstruction}".

Provide clear, concise, practical culinary advice. If they ask about substitutions, doneness, temperatures, fixing mistakes, or timing, answer directly and warmly. Keep answers concise and easy to read while actively cooking.`,
            },
            ...messages.slice(-4).map((m) => ({
              role: m.sender === 'user' ? 'user' : 'assistant',
              content: m.text,
            })),
            {
              role: 'user',
              content: query,
            },
          ],
          context: {
            page: 'cook',
            assistantMode: 'chef',
          },
        }

        const { data, error } = await supabase.functions.invoke('ai-assistant', {
          body: requestBody,
        })

        if (!error && (data?.text || data?.displayText)) {
          finalResponse = (data.text || data.displayText).trim()
        } else {
          // Fallback response if offline/unreachable
          finalResponse = `👩‍🍳 For **${recipeName}** (Step ${currentStepIndex + 1}): Ensure your ingredients are pre-measured nearby so you can work quickly without scorching. If you need a timer, pan temperature adjust, meat doneness check, or substitution, let me know!`
        }
      } catch {
        finalResponse = `👩‍🍳 For **${recipeName}** (Step ${currentStepIndex + 1}): Ensure your ingredients are pre-measured nearby so you can work quickly without scorching. If you need a timer, pan temperature adjust, meat doneness check, or substitution, let me know!`
      }
    }

    const chefMsg: SousChefMessage = {
      id: `msg-${Date.now() + 1}`,
      sender: 'chef',
      text: finalResponse,
      timestamp: 'Now',
    }

    setMessages((prev) => [...prev, chefMsg])
    setIsTyping(false)

    return finalResponse
  }, [input, cookingContext, ingredients, allSteps, recipeName, currentStepIndex, totalSteps, recipeScale, currentStepInstruction, messages])

  const dictation = useFieldDictation({
    onText: (text) => setInput(text),
    onComplete: (fullText) => {
      handleSendMessage(fullText)
    },
    autoSubmitOnSilence: true,
    silenceTimeoutMs: 1400,
  })

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleChipClick = (chip: typeof stepQuickChips[number]) => {
    if (chip.action?.type === 'timer') {
      onAddTimer(chip.action.label, chip.action.seconds)
    }
    handleSendMessage(chip.prompt)
  }

  return (
    <Card
      tone="surface"
      padding="none"
      className={cn(
        'w-full flex flex-col h-full overflow-hidden border-casa-border/80 shadow-md rounded-3xl bg-casa-surface/95 backdrop-blur-xs',
        className
      )}
    >
      {/* Header */}
      <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-500/15 via-casa-surface to-casa-surface border-b border-casa-border/80 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-casa-gold text-slate-950 flex items-center justify-center font-bold shadow-xs shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-display text-body-lg font-bold text-casa-navy leading-tight truncate">
                AI Sous Chef
              </h2>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            <p className="text-2xs uppercase tracking-wider text-amber-800 font-bold truncate">
              Step {currentStepIndex + 1} of {totalSteps} · {recipeName}
            </p>
          </div>
        </div>

        {onClose && (
          <IconButton
            icon={<X size={16} />}
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close Sous Chef sidecar"
          />
        )}
      </div>

      {/* Quick Assist Chips */}
      <div className="p-3 bg-casa-bg/60 border-b border-casa-border/60 shrink-0 space-y-1.5">
        <span className="text-2xs font-bold uppercase tracking-widest text-casa-muted block">
          Quick Assist (Step {currentStepIndex + 1}):
        </span>
        <div className="flex flex-wrap gap-1.5">
          {stepQuickChips.map((chip, i) => (
            <Chip
              key={i}
              tone="neutral"
              size="sm"
              onClick={() => handleChipClick(chip)}
              className="text-caption font-semibold hover:border-casa-gold/80 hover:bg-casa-gold/10"
            >
              {chip.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex flex-col max-w-[90%] rounded-2xl p-3 text-body-sm leading-relaxed shadow-xs',
              msg.sender === 'user'
                ? 'ml-auto bg-casa-navy text-white rounded-br-xs'
                : 'mr-auto bg-casa-bg border border-casa-border text-casa-navy rounded-bl-xs'
            )}
          >
            <div className="flex items-center gap-1.5 mb-1 opacity-70">
              {msg.sender === 'chef' ? (
                <ChefHat size={12} className="text-casa-gold" />
              ) : (
                <span className="text-3xs font-bold uppercase tracking-widest">You</span>
              )}
              <span className="text-3xs font-mono">{msg.timestamp}</span>
            </div>
            <p className="whitespace-pre-line font-body leading-relaxed">{msg.text}</p>
          </div>
        ))}

        {isTyping && (
          <div className="mr-auto bg-casa-bg border border-casa-border p-2.5 rounded-2xl rounded-bl-xs flex items-center gap-1.5 text-casa-muted text-caption">
            <span className="w-1.5 h-1.5 rounded-full bg-casa-gold animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-casa-gold animate-bounce [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-casa-gold animate-bounce [animation-delay:0.4s]" />
            <span className="ml-1 text-2xs font-bold uppercase tracking-wider">Chef is answering...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input & Voice Trigger */}
      <div className="p-3 border-t border-casa-border/80 bg-casa-surface shrink-0 space-y-2">
        {dictation.listening && (
          <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-amber-800 bg-amber-500/15 border border-amber-500/30 rounded-xl px-3 py-1.5 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping" />
              <span>Listening... will auto-send when you pause</span>
            </div>
            <span className="text-3xs font-mono font-bold bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-900">
              Hands-Free
            </span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSendMessage()
          }}
          className="flex items-center gap-2"
        >
          <IconButton
            icon={<Mic size={18} />}
            variant={dictation.listening ? 'primary' : 'secondary'}
            size="md"
            onClick={() => dictation.toggle(input)}
            aria-label={dictation.listening ? 'Stop listening' : 'Start voice dictation'}
            className={cn(dictation.listening && 'bg-red-500 hover:bg-red-600 text-white animate-pulse')}
          />

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={dictation.listening ? 'Listening... speak now' : 'Ask Chef: substitutions, pan temp, meat temp...'}
            className="flex-1 text-body-sm px-3.5 py-2.5 rounded-xl border border-casa-border bg-casa-bg text-casa-navy placeholder:text-casa-muted focus:outline-none focus:ring-2 focus:ring-casa-gold/50 min-h-[44px]"
          />

          <Button
            variant="champagne"
            size="md"
            type="submit"
            disabled={!input.trim() || isTyping}
            className="font-bold px-3.5 min-h-[44px] shrink-0"
            aria-label="Send question to Sous Chef"
          >
            <Send size={16} />
          </Button>
        </form>
      </div>
    </Card>
  )
}
