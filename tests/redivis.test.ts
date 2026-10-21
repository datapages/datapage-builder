import { describe, expect, it } from 'vitest';
import { referenceName } from '../src/lib/redivis';

describe('referenceName', () => {
  it('gets dataset reference names from qualified references', () => {
    expect(referenceName('datapages.many_babies_4:20k3:v1_0')).toBe('many_babies_4');
    expect(referenceName('datapages.refbank')).toBe('refbank');
  });

  it('gets table reference names from table URIs', () => {
    expect(referenceName('/tables/datapages.palmerpenguins:9g3v:v1_0.penguins:79km')).toBe('penguins');
    expect(referenceName('/tables/mikabr.chunk_test:abcd:next.chunk_test:k992')).toBe('chunk_test');
  });
});
