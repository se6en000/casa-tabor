export function requireEnv(name) {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function optionalEnv(name, fallback = '') {
  const value = Deno.env.get(name)
  return value ?? fallback
}
