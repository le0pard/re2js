import { expect, describe, test } from '@jest/globals'
import { RE2 } from '../RE2'

it('example', () => {
  const re = RE2.compile('(?i:co(.)a)')
  expect(re.findAll('Copacobana', 10)).toEqual(['Copa', 'coba'])

  const res = re.findAllSubmatch('Copacobana', 100)
  expect(res[0]).toEqual(['Copa', 'p'])
  expect(res[1]).toEqual(['coba', 'b'])
})
