import { test, expect } from 'vitest'
import { inferenceAllowed } from '../src/main/automation/inferencePolicy'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
const local = { ...DEFAULT_ENGINE, model: 'qwen:3b' }
const remoteTagFetch = (async () => new Response(JSON.stringify({models:[{name:'qwen:3b',remote_host:'cloud.example',remote_model:'elsewhere'}]}))) as typeof fetch
const localTagFetch = (async () => new Response(JSON.stringify({models:[{name:'qwen:3b'}]}))) as typeof fetch

test('global cloud Off blocks agy, a provider brain, and cloud suffixes without sending any prompt', async()=>{
 let calls=0;const request=(async()=>{calls++;return new Response('{}')}) as typeof fetch
 for(const engine of [{...local,id:'agy' as const},{...local,cloudProvider:'anthropic' as const},{...local,model:'model:cloud'},{...local,baseUrl:'https://outside.example'}])expect((await inferenceAllowed(engine,true,false,request)).ok).toBe(false)
 expect(calls).toBe(0)
})
test('opaque cloud model metadata is blocked and metadata requests never contain task text',async()=>{
 expect((await inferenceAllowed(local,true,false,remoteTagFetch)).ok).toBe(false)
 expect((await inferenceAllowed(local,true,false,localTagFetch)).ok).toBe(true)
})
test('local Off and cloud On permit only verified remote inference, not a local model',async()=>{
 expect((await inferenceAllowed(local,false,true,localTagFetch)).ok).toBe(false)
 expect((await inferenceAllowed(local,false,true,remoteTagFetch)).ok).toBe(true)
 expect((await inferenceAllowed({...local,id:'agy'},false,true)).ok).toBe(true)
})
test('unknown location and denied metadata fail closed when an inference category is off',async()=>{
 expect((await inferenceAllowed(local,true,false,(async()=>{throw Error('unreachable')})as typeof fetch)).ok).toBe(false)
 expect((await inferenceAllowed(local,false,false,localTagFetch)).ok).toBe(false)
})
