import { main } from '../src/index'

describe('main', () => {
  it('does nothing', () => {
    expect(main('null', 0)).toBe(undefined)
  })
})
