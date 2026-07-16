import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cook = readFileSync(resolve('src/pages/CookPage.tsx'), 'utf8')
const disclosure = readFileSync(resolve('src/components/ui/DisclosureSection.tsx'), 'utf8')

test('recipe photo editing uses one controlled disclosure instead of a nested modal', () => {
  assert.match(cook, /<DisclosureSection[\s\S]{0,260}title="Photo"[\s\S]{0,260}open=\{photoEditorExpanded\}/)
  assert.doesNotMatch(cook, /photoEditorOpen &&/)
  assert.doesNotMatch(cook, /Recipe photo editor/)
  assert.doesNotMatch(cook, />\s*Edit photo\s*</)
  assert.match(disclosure, /open\?: boolean/)
  assert.match(disclosure, /onOpenChange\?: \(open: boolean\) => void/)
})

test('open photo section accepts image paste without intercepting text paste', () => {
  assert.match(cook, /onPaste=\{photoEditorExpanded \? handlePhotoEditorPaste : undefined\}/)
  assert.match(cook, /find\(\(item\) => item\.kind === 'file' && item\.type\.startsWith\('image\/'\)\)/)
  assert.match(cook, /if \(!imageItem\) return[\s\S]{0,180}event\.preventDefault\(\)[\s\S]{0,100}stagePhotoEditorImage\(file\)/)
  assert.match(cook, /Paste a screenshot anywhere in this section/)
})

test('pasted and selected images are validated, previewed, and deferred until Save changes', () => {
  assert.match(cook, /if \(!isLikelyImageFile\(file\)\)/)
  assert.match(cook, /if \(file\.size > 10 \* 1024 \* 1024\)/)
  assert.match(cook, /URL\.createObjectURL\(file\)/)
  assert.match(cook, /URL\.revokeObjectURL\(photoEditorObjectUrlRef\.current\)/)
  assert.match(cook, /const imageUrl = await resolvePhotoEditorImageUrl\(cookRecipe\.id\)/)
  assert.match(cook, /supabase\.functions\.invoke\('recipe-photo-upload'/)
  assert.match(cook, /\.\.\.\(imageUrl !== undefined \? \{ image_url: imageUrl \} : \{\}\)/)
})

test('photo draft preserves all source choices and one-save semantics', () => {
  for (const label of ['Choose image', 'Take photo', 'Find a recipe image', 'Image URL', 'Auto-crop']) {
    assert.match(cook, new RegExp(label))
  }
  assert.doesNotMatch(cook, />\s*Save photo\s*</)
  assert.match(cook, />\s*Save changes\s*</)
  assert.match(cook, /function cancelRecipeEditing\(\) \{\s*clearPhotoEditorPendingFile\(\)/)
  assert.match(cook, /photoEditorError && <p role="alert"/)
})
