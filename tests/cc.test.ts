import { describe, it, expect } from 'vitest';
import { compileProject } from '../src/sim/cc/compile';
import { Simulator } from '../src/sim/simulator';

function run(src: string, seconds = 0.01, printfFloat = false) {
  const files: Record<string, string> = {
    'Core/Inc/main.h': '#include "stm32f4xx_hal.h"\n',
    'Core/Src/main.c': src,
  };
  const r = compileProject(files, ['Core/Src/main.c']);
  if (!r.ok) throw new Error(r.diags.map((d) => `${d.file}:${d.line}:${d.col}: ${d.severity}: ${d.message}`).join('\n'));
  const sim = new Simulator();
  sim.load(r.program!, { printfFloat });
  // capture putchar output
  sim.runFor(seconds);
  return { sim, r };
}

const OUT = `
#include "main.h"
#include <stdio.h>
#include <string.h>
char outbuf[2048]; int outlen;
int __io_putchar(int ch) { outbuf[outlen++] = (char)ch; return ch; }
`;

function output(sim: Simulator): string {
  const g = sim.rt!.program.globals.find((x) => x.name === 'outbuf')!;
  return sim.rt!.cstr(g.addr, 2048);
}

describe('C semantics', () => {
  it('integer arithmetic and wraparound', () => {
    const { sim } = run(OUT + `
int main(void){
  uint8_t a = 250; a += 10;
  int8_t b = 127; b++;
  uint32_t c = 0; c--;
  int d = -7 / 2; int e = -7 % 2;
  unsigned u = 7u / 2u;
  int f = (int)3.99f; int g = (int)-3.99;
  uint16_t h = 65535; h = h + 1;
  long long big = 1LL << 40;
  printf("%u %d %lu %d %d %u %d %d %u %lld\\n", a, b, c, d, e, u, f, g, h, big);
  printf("[%5d][%-5d][%05d][%x][%X][%c][%s][%%]\\n", 42, 42, 42, 255, 255, 'Z', "hi");
  if (-1 < 1u) printf("bad\\n"); else printf("ok-unsigned\\n");
  while(1){}
}`);
    expect(output(sim)).toBe('4 -128 4294967295 -3 -1 3 3 -3 0 1099511627776\n[   42][42   ][00042][ff][FF][Z][hi][%]\nok-unsigned\n');
  });

  it('structs, arrays, pointers, initializers', () => {
    const { sim } = run(OUT + `
typedef struct { int x; uint8_t y; uint32_t z[3]; } S;
S gs = { 1, 2, {3,4,5} };
int arr[5] = {1,2,3};
static int sum(int *p, int n) { int s = 0; for (int i = 0; i < n; i++) s += p[i]; return s; }
int fact(int n) { return n <= 1 ? 1 : n * fact(n-1); }
int main(void){
  S ls = {0};
  ls.x = 10; ls.z[2] = 7;
  S *p = &ls; p->y = 9;
  S cp = gs; cp.x += 100;
  char buf[24];
  sprintf(buf, "v=%d", sizeof(S));
  int m[2][3] = {{1,2,3},{4,5,6}};
  struct { int a; int b; } d = { .b = 5, .a = 6 };
  printf("%d %d %d %d %d %d %s %d %d %d %d\\n", ls.x, ls.y, ls.z[2], cp.x, cp.z[1], sum(arr,5), buf, fact(5), m[1][2], d.a, d.b);
  uint8_t bytes[4]; uint32_t w = 0x11223344; memcpy(bytes, &w, 4);
  printf("%x %x\\n", bytes[0], bytes[3]);
  while(1){}
}`);
    expect(output(sim)).toBe('10 9 7 101 4 6 v=20 120 6 6 5\n44 11\n');
  });

  it('floats, switch, loops, function pointers', () => {
    const { sim } = run(OUT + `
static int twice(int v){ return v*2; }
int main(void){
  float f = 0.1f; f = f * 3;
  double d = 1.0/3.0;
  int k = 0;
  for (int i = 0; i < 10; i++) { if (i == 3) continue; if (i == 8) break; k += i; }
  int s = 0; int x = 2;
  switch (x) { case 1: s = 1; break; case 2: s = 2; case 3: s += 3; break; default: s = 99; }
  int (*fp)(int) = twice;
  int j = 0; do { j++; } while (j < 5);
  printf("%d %d %d %d %d\\n", (int)(f*1000), (int)(d*1e6), k, s, fp(21) + j);
  while(1){}
}`);
    expect(output(sim)).toBe('300 333333 25 5 47\n');
  });

  it('printf %f needs newlib float option', () => {
    const src = OUT + `int main(void){ float t = 23.5f; printf("T=%.1f C\\n", t); while(1){} }`;
    expect(output(run(src).sim)).toBe('T= C\n');
    expect(output(run(src, 0.01, true).sim)).toBe('T=23.5 C\n');
  });

  it('reports compile errors with line numbers', () => {
    const r = compileProject({ 'Core/Inc/main.h': '', 'Core/Src/main.c': 'int main(void){\n  int x = 1\n  return 0;\n}\n' }, ['Core/Src/main.c']);
    expect(r.ok).toBe(false);
    expect(r.diags[0].line).toBe(3);
    const r2 = compileProject({ 'Core/Inc/main.h': '', 'Core/Src/main.c': 'int main(void){\n  foo();\n  return 0;\n}\n' }, ['Core/Src/main.c']);
    expect(r2.ok).toBe(false);
    expect(r2.diags.some((d) => /undefined reference to `foo'/.test(d.message))).toBe(true);
    const r3 = compileProject({ 'Core/Inc/main.h': '', 'Core/Src/main.c': 'int main(void){\n  y = 2;\n}\n' }, ['Core/Src/main.c']);
    expect(r3.diags[0].message).toMatch(/'y' undeclared/);
    expect(r3.diags[0].line).toBe(2);
  });
});
