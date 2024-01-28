import { describe, it, expect } from 'bun:test'
import { ComfyDeployClient } from '../src'

describe('should', () => {
  it('export ComfyDeployClient', () => {
    expect(ComfyDeployClient).toSatisfy((client) => client !== undefined)
  })
})
