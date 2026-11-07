import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { authStorageKeys, clearSession, demoUser, isValidEmail, isValidPassword, loginAccount, normalizeEmail, readSession, registerAccount, saveSession } from '../src/lib/auth.ts'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
}
beforeEach(() => {
  globalThis.localStorage = memoryStorage()
  globalThis.sessionStorage = memoryStorage()
})
const input = { name: '测试经理', email: 'manager@example.com', password: 'DemoPass123' }
const hasCode = code => error => error.code === code

test('registration normalizes email and name, and login verifies the exact password', async () => {
  const user = await registerAccount({ ...input, name: ' 测试经理 ', email: ' Manager@Example.COM ' })
  assert.equal(user.name, input.name)
  assert.equal(user.email, input.email)
  assert.equal(user.demo, false)
  assert.deepEqual(await loginAccount(' MANAGER@EXAMPLE.COM ', input.password), user)
  await assert.rejects(loginAccount(input.email, 'WrongPass123'), hasCode('invalidCredentials'))
  await assert.rejects(loginAccount('unknown@example.com', input.password), hasCode('invalidCredentials'))
  await assert.rejects(loginAccount(input.email, ` ${input.password}`), hasCode('invalidCredentials'))
})

test('account records contain salted password hashes and no plaintext password', async () => {
  await registerAccount(input)
  await registerAccount({ ...input, email: 'second@example.com' })
  const stored = localStorage.getItem(authStorageKeys.accounts)
  assert.ok(!stored.includes(input.password))
  const accounts = JSON.parse(stored)
  assert.equal(accounts[0].salt.length, 32)
  assert.equal(accounts[0].passwordHash.length, 64)
  assert.notEqual(accounts[0].salt, accounts[1].salt)
  assert.notEqual(accounts[0].passwordHash, accounts[1].passwordHash)
  assert.deepEqual(Object.keys(accounts[0]).sort(), ['email', 'id', 'name', 'passwordHash', 'salt'])
})

test('duplicate emails are rejected without replacing the original account', async () => {
  const user = await registerAccount(input)
  await assert.rejects(registerAccount({ ...input, email: 'MANAGER@example.com', password: 'AnotherPass123' }), hasCode('emailTaken'))
  assert.equal(JSON.parse(localStorage.getItem(authStorageKeys.accounts)).length, 1)
  assert.deepEqual(await loginAccount(input.email, input.password), user)
})

test('invalid registration data is rejected before any account is stored', async () => {
  for (const [change, code] of [
    [{ name: ' ' }, 'invalidName'], [{ name: 'a'.repeat(41) }, 'invalidName'],
    [{ email: 'invalid' }, 'invalidEmail'], [{ password: 'short1' }, 'invalidPassword'],
    [{ password: '12345678' }, 'invalidPassword'], [{ password: 'abcdefgh' }, 'invalidPassword'],
    [{ password: 'a1'.repeat(37) }, 'invalidPassword'],
  ]) await assert.rejects(registerAccount({ ...input, ...change }), hasCode(code))
  assert.equal(localStorage.getItem(authStorageKeys.accounts), null)
  assert.equal(normalizeEmail(' A@B.COM '), 'a@b.com')
  assert.ok(isValidEmail('a@b.com'))
  assert.ok(!isValidEmail('a @b.com'))
  assert.ok(isValidPassword('abcdefg1'))
})

test('normal sessions survive refresh in the current tab and expire after eight hours', async () => {
  const user = await registerAccount(input)
  const session = saveSession(user, false)
  assert.deepEqual(readSession(), session)
  assert.equal(localStorage.getItem(authStorageKeys.persistentSession), null)
  assert.ok(sessionStorage.getItem(authStorageKeys.session))
  assert.ok(Math.abs(session.expiresAt - Date.now() - 8 * 60 * 60 * 1000) < 1000)
  sessionStorage.setItem(authStorageKeys.session, JSON.stringify({ ...session, expiresAt: Date.now() - 1 }))
  assert.equal(readSession(), null)
})

test('remember me lasts seven days, and sign out removes both kinds of session', async () => {
  const user = await registerAccount(input)
  saveSession(user, false)
  const session = saveSession(user, true)
  assert.equal(sessionStorage.getItem(authStorageKeys.session), null)
  assert.deepEqual(readSession(), session)
  assert.ok(Math.abs(session.expiresAt - Date.now() - 7 * 24 * 60 * 60 * 1000) < 1000)
  clearSession()
  assert.equal(readSession(), null)
  assert.equal(localStorage.getItem(authStorageKeys.persistentSession), null)
  assert.equal(sessionStorage.getItem(authStorageKeys.session), null)
  assert.deepEqual(await loginAccount(input.email, input.password), user)
})

test('switching off remember me removes an earlier persistent session', () => {
  saveSession(demoUser, true)
  saveSession(demoUser, false)
  assert.equal(localStorage.getItem(authStorageKeys.persistentSession), null)
  assert.deepEqual(readSession()?.user, demoUser)
})

test('corrupt, expired, mismatched and deleted-account sessions fail closed', async () => {
  const user = await registerAccount(input)
  const session = saveSession(user, false)
  for (const raw of ['broken', '{}', 'null', JSON.stringify({ ...session, expiresAt: 'later' }), JSON.stringify({ ...session, user: { ...user, name: 'Different user' } }), JSON.stringify({ ...session, user: { ...user, demo: true } })]) {
    sessionStorage.setItem(authStorageKeys.session, raw)
    assert.equal(readSession(), null)
  }
  saveSession(user, false)
  localStorage.removeItem(authStorageKeys.accounts)
  assert.equal(readSession(), null)
})

test('corrupt accounts are reported and never silently overwritten', async () => {
  for (const raw of ['broken', '{}', 'null', '[{"id":"bad"}]']) {
    localStorage.setItem(authStorageKeys.accounts, raw)
    await assert.rejects(registerAccount(input), hasCode('storageCorrupt'))
    await assert.rejects(loginAccount(input.email, input.password), hasCode('storageCorrupt'))
    assert.equal(localStorage.getItem(authStorageKeys.accounts), raw)
  }
})

test('blocked browser storage produces useful errors without creating a session', async () => {
  globalThis.localStorage = { getItem() { throw new Error('Blocked') }, setItem() { throw new Error('Blocked') }, removeItem() { throw new Error('Blocked') } }
  assert.equal(readSession(), null)
  await assert.rejects(registerAccount(input), hasCode('storageUnavailable'))
  assert.throws(() => saveSession(demoUser, true), hasCode('storageUnavailable'))
  assert.throws(() => clearSession(), hasCode('storageUnavailable'))
  assert.equal(sessionStorage.getItem(authStorageKeys.session), null)
})
