import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findSavedRecipes,
  formatSavedRecipeMatches,
} from '../supabase/functions/_shared/assistant-recipe-read.mjs'

const recipes = [
  {
    id: 'one',
    name: 'Quick Salmon Power Bowls',
    recipe_ingredients: [{ name: 'salmon' }, { name: 'brown rice' }],
  },
  {
    id: 'two',
    name: 'Salmon Rice Bowls',
    recipe_ingredients: [{ name: 'salmon' }, { name: 'sushi rice' }],
  },
  {
    id: 'three',
    name: 'Tomato Soup',
    recipe_ingredients: [{ name: 'tomatoes' }],
  },
]

test('saved recipe search handles singular and plural title terms', () => {
  assert.deepEqual(
    findSavedRecipes(recipes, 'salmon bowl').map((recipe) => recipe.id),
    ['one', 'two'],
  )
})

test('saved recipe search can match authoritative ingredients', () => {
  assert.deepEqual(
    findSavedRecipes(recipes, 'brown rice').map((recipe) => recipe.id),
    ['one'],
  )
})

test('saved recipe results never imply an unsaved match', () => {
  assert.match(formatSavedRecipeMatches([], 'chicken curry'), /couldn't find a saved recipe/)
  assert.match(formatSavedRecipeMatches([recipes[0]], 'salmon bowl'), /Quick Salmon Power Bowls/)
})
