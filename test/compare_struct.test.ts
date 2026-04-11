/**
 * Comparación exhaustiva: HékatanLab vs Hekatan Struct (WASM)
 * Los modelos usan los MISMOS parámetros que el CLI del workspace
 * Valores de referencia obtenidos con: node cli.mjs <gen> --static
 *
 * Run: npx vitest run test/compare_struct.test.ts --reporter=verbose
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createEngine } from '../src/engine';

interface Model {
  name: string;
  code: string;
  wasmRef: { maxU: number; maxNode: number };
}

const MODELS: Model[] = [
  // ═══ 1. Barra ═══
  { name: 'Barra (PL/EA=2.5e-4)',
    wasmRef: { maxU: 2.5e-4, maxNode: 5 },
    code: `E=200e6; A=0.01; L=5; nE=5; P=100; dL=L/nE
nds=zeros(nE+1,3)
for i=range(0,nE,1)
  nds(i+1,1)=dL*i
end
els=zeros(nE,2)
for i=range(0,nE-1,1)
  els(i+1,1)=i+1; els(i+1,2)=i+2
end
sups=[1,1,1,1,1,1,1]
loads=[nE+1, P, 0, 0, 0, 0, 0]
Uf=fem_deform(nds,els,sups,loads,E,0.3,1,A,1e-6,1e-6,77e6,1e-6)
maxU=0
for i=range(1,size(nds,1),1)
  ux=abs(Uf((i-1)*6+1)); uy=abs(Uf((i-1)*6+2)); uz=abs(Uf((i-1)*6+3))
  mag=sqrt(ux^2+uy^2+uz^2)
  if mag > maxU
    maxU=mag
  end
end
disp("maxU:"); disp(maxU)` },

  // ═══ 2. Portico ═══
  { name: 'Portico (W=6, H=4, Fz=-10)',
    wasmRef: { maxU: 8.7326e-4, maxNode: 5 },
    code: `E=25e6; G=10.4e6; A=0.16; Iz=2.13e-3; Iy=2.13e-3; J=3.6e-3
ww=6; hh=4; nSub=4
nds=zeros(4+nSub-1, 3)
nds(1,1)=0; nds(1,3)=0
nds(2,1)=0; nds(2,3)=hh
nds(3,1)=ww; nds(3,3)=hh
nds(4,1)=ww; nds(4,3)=0
for k=range(1,nSub-1,1)
  nds(4+k,1)=k*ww/nSub; nds(4+k,3)=hh
end
els=zeros(2+nSub, 2)
els(1,1)=1; els(1,2)=2
els(2,1)=3; els(2,2)=4
prevN=2
for k=range(1,nSub-1,1)
  els(2+k,1)=prevN; els(2+k,2)=4+k; prevN=4+k
end
els(2+nSub,1)=prevN; els(2+nSub,2)=3
sups=[1,1,1,1,1,1,1; 4,1,1,1,1,1,1]
fz=-10
nL=0; loads=zeros(1,7)
for i=range(1,size(nds,1),1)
  skip=0
  if i==1
    skip=1
  end
  if i==4
    skip=1
  end
  if skip==0
    nL=nL+1; loads(nL,1)=i; loads(nL,4)=fz
  end
end
Uf=fem_deform(nds,els,sups,loads,E,0.3,1,A,Iz,Iy,G,J)
maxU=0
for i=range(1,size(nds,1),1)
  ux=abs(Uf((i-1)*6+1)); uy=abs(Uf((i-1)*6+2)); uz=abs(Uf((i-1)*6+3))
  mag=sqrt(ux^2+uy^2+uz^2)
  if mag > maxU
    maxU=mag
  end
end
disp("maxU:"); disp(maxU)` },

  // ═══ 3. Cercha Warren ═══
  { name: 'Cercha Warren (L=20, nDiv=10, h=3)',
    wasmRef: { maxU: 2.1071e-2, maxNode: 5 },
    code: `span=20; nDiv=10; hh=3; E=200e6; G=77e6; A=5e-4; Iz=2e-8; Iy=2e-8; J=1e-8; dx=span/nDiv
nds=zeros((nDiv+1)*2, 3)
for kk=range(0,nDiv,1)
  nds(kk+1,1)=dx*kk
end
for kk=range(0,nDiv,1)
  nds(nDiv+1+kk+1,1)=dx*kk; nds(nDiv+1+kk+1,3)=hh
end
els=zeros(1,2); nEls=0; bb=nDiv+1
for kk=range(0,nDiv-1,1)
  nEls=nEls+1; els(nEls,1)=kk+1; els(nEls,2)=kk+2
end
for kk=range(0,nDiv-1,1)
  nEls=nEls+1; els(nEls,1)=bb+kk+1; els(nEls,2)=bb+kk+2
end
for kk=range(0,nDiv,1)
  nEls=nEls+1; els(nEls,1)=kk+1; els(nEls,2)=bb+kk+1
end
for kk=range(0,nDiv-1,1)
  nEls=nEls+1
  if kk < nDiv/2
    els(nEls,1)=kk+1; els(nEls,2)=bb+kk+2
  else
    els(nEls,1)=bb+kk+1; els(nEls,2)=kk+2
  end
end
sups=[1,1,1,1,1,1,1; nDiv+1,1,1,1,1,1,1]
loads=zeros(1,7); nL=0
for kk=range(0,nDiv,1)
  nL=nL+1; loads(nL,1)=kk+1; loads(nL,4)=-10
end
Uf=fem_deform(nds,els,sups,loads,E,0.3,1,A,Iz,Iy,G,J)
maxU=0
for i=range(1,size(nds,1),1)
  ux=abs(Uf((i-1)*6+1)); uy=abs(Uf((i-1)*6+2)); uz=abs(Uf((i-1)*6+3))
  mag=sqrt(ux^2+uy^2+uz^2)
  if mag > maxU
    maxU=mag
  end
end
disp("maxU:"); disp(maxU)` },

  // ═══ 4. Edificio 2x2x3 ═══
  { name: 'Edificio 2x2x3 (svx=5, svy=4, hp=3)',
    wasmRef: { maxU: 8.0e-4, maxNode: 35 },
    code: `E=200e6; nu=0.3; G=77e6; A=0.01; Iz=8.33e-5; Iy=8.33e-5; J=1.41e-4
svx=5; svy=4; hp=3; nP=3; nVx=2; nVy=2
nNx=nVx+1; nNy=nVy+1; nPF=nNx*nNy; nTotal=nPF*(nP+1)
nds=zeros(nTotal,3); nn=0
for iz=range(0,nP,1)
  for iy=range(0,nVy,1)
    for ix=range(0,nVx,1)
      nn=nn+1; nds(nn,1)=ix*svx; nds(nn,2)=iy*svy; nds(nn,3)=iz*hp
    end
  end
end
els=zeros(1,2); nE=0
for iz=range(0,nP-1,1)
  for n2=range(1,nPF,1)
    nE=nE+1; els(nE,1)=iz*nPF+n2; els(nE,2)=(iz+1)*nPF+n2
  end
end
for iz=range(1,nP,1)
  for iy=range(0,nVy,1)
    for ix=range(0,nVx-1,1)
      nE=nE+1; n1=iz*nPF+iy*nNx+ix+1; els(nE,1)=n1; els(nE,2)=n1+1
    end
  end
end
for iz=range(1,nP,1)
  for iy=range(0,nVy-1,1)
    for ix=range(0,nVx,1)
      nE=nE+1; n1=iz*nPF+iy*nNx+ix+1; els(nE,1)=n1; els(nE,2)=n1+nNx
    end
  end
end
sups=zeros(nPF,7)
for ii=range(1,nPF,1)
  sups(ii,1)=ii; sups(ii,2)=1; sups(ii,3)=1; sups(ii,4)=1; sups(ii,5)=1; sups(ii,6)=1; sups(ii,7)=1
end
CM=-10; totalArea=(nVx*svx)*(nVy*svy); loadPN=CM*totalArea/nPF
loads=zeros(1,7); nL=0
for iz=range(1,nP,1)
  for iy=range(0,nVy,1)
    for ix=range(0,nVx,1)
      nL=nL+1; loads(nL,1)=iz*nPF+iy*nNx+ix+1; loads(nL,4)=loadPN
    end
  end
end
Uf=fem_deform(nds,els,sups,loads,E,nu,1,A,Iz,Iy,G,J)
maxU=0
for i=range(1,size(nds,1),1)
  ux=abs(Uf((i-1)*6+1)); uy=abs(Uf((i-1)*6+2)); uz=abs(Uf((i-1)*6+3))
  mag=sqrt(ux^2+uy^2+uz^2)
  if mag > maxU
    maxU=mag
  end
end
disp("maxU:"); disp(maxU)` },

  // ═══ 5. Eiffel ═══
  { name: 'Eiffel (H=30, base=12, 8 levels)',
    wasmRef: { maxU: 1.937e-1, maxNode: 35 },
    code: `H=30; Bbase=12; nLvl=8; E=200e6; G=77e6; A=50e-4; Iz=200e-8; Iy=200e-8; J=100e-8
nN=(nLvl+1)*4; nds=zeros(nN, 3)
for iz=range(0,nLvl,1)
  tt=iz/nLvl; z=H*tt; w=Bbase*(1-tt)*(1-tt*0.3)
  b=iz*4
  nds(b+1,1)=-w/2; nds(b+1,2)=-w/2; nds(b+1,3)=z
  nds(b+2,1)=w/2;  nds(b+2,2)=-w/2; nds(b+2,3)=z
  nds(b+3,1)=w/2;  nds(b+3,2)=w/2;  nds(b+3,3)=z
  nds(b+4,1)=-w/2; nds(b+4,2)=w/2;  nds(b+4,3)=z
end
els=zeros(1,2); nE=0
for iz=range(0,nLvl,1)
  b=iz*4
  isTop=0
  if iz==nLvl
    isTop=1
  end
  if isTop==0
    for j=range(0,2,1)
      nE=nE+1; els(nE,1)=b+j+1; els(nE,2)=b+j+2
    end
    nE=nE+1; els(nE,1)=b+4; els(nE,2)=b+1
    if iz>0
      nE=nE+1; els(nE,1)=b+1; els(nE,2)=b+3
      nE=nE+1; els(nE,1)=b+2; els(nE,2)=b+4
    end
  end
end
for iz=range(0,nLvl-1,1)
  b=iz*4; nb=(iz+1)*4
  for j=range(0,3,1)
    nE=nE+1; els(nE,1)=b+j+1; els(nE,2)=nb+j+1
  end
  nE=nE+1; els(nE,1)=b+1; els(nE,2)=nb+2
  nE=nE+1; els(nE,1)=b+2; els(nE,2)=nb+3
  nE=nE+1; els(nE,1)=b+3; els(nE,2)=nb+4
  nE=nE+1; els(nE,1)=b+4; els(nE,2)=nb+1
end
sups=[1,1,1,1,1,1,1; 2,1,1,1,1,1,1; 3,1,1,1,1,1,1; 4,1,1,1,1,1,1]
topNode=nLvl*4+1
loads=[topNode, 0, 0, -50, 0, 0, 0; topNode+1, 0, 0, -50, 0, 0, 0; topNode+2, 0, 0, -50, 0, 0, 0; topNode+3, 0, 0, -50, 0, 0, 0]
Uf=fem_deform(nds,els,sups,loads,E,0.3,1,A,Iz,Iy,G,J)
maxU=0
for i=range(1,size(nds,1),1)
  ux=abs(Uf((i-1)*6+1)); uy=abs(Uf((i-1)*6+2)); uz=abs(Uf((i-1)*6+3))
  mag=sqrt(ux^2+uy^2+uz^2)
  if mag > maxU
    maxU=mag
  end
end
disp("maxU:"); disp(maxU)` },
];

const report: { name: string; hekatanlab: number; wasm: number; ratio: number; status: string }[] = [];

describe('HékatanLab vs WASM Solver Comparison', () => {
  for (const model of MODELS) {
    it(model.name, async () => {
      const engine = createEngine();
      const results = await engine.evaluate(model.code);
      const errors = results.filter(r => r.type === 'error');

      if (errors.length > 0) {
        console.log(`⛔ ${model.name} ERRORS:`);
        errors.slice(0, 3).forEach(e => console.log(`  L${e.line}: ${e.error}`));
        report.push({ name: model.name, hekatanlab: NaN, wasm: model.wasmRef.maxU, ratio: NaN, status: '⛔ ERROR' });
        expect(errors.length).toBe(0);
        return;
      }

      // Extract maxU from disp output
      const dispResults = results.filter(r => r.type === 'disp');
      let maxU = NaN;
      for (let i = 0; i < dispResults.length; i++) {
        if (String(dispResults[i].value).includes('maxU') && i + 1 < dispResults.length) {
          maxU = parseFloat(String(dispResults[i + 1].value));
        }
      }

      // Also try from last value result
      if (isNaN(maxU)) {
        const valResults = results.filter(r => r.type === 'value' && r.input?.includes('maxU'));
        if (valResults.length > 0) maxU = parseFloat(String(valResults[valResults.length - 1].value));
      }

      const ratio = isNaN(maxU) ? NaN : maxU / model.wasmRef.maxU;
      const ok = !isNaN(ratio) && ratio > 0.8 && ratio < 1.2;
      const status = isNaN(ratio) ? '⚠️ NO VALUE' : ok ? '✅ MATCH' : '❌ MISMATCH';

      report.push({ name: model.name, hekatanlab: maxU, wasm: model.wasmRef.maxU, ratio, status });

      if (!isNaN(ratio)) {
        expect(ratio, `${model.name}: ratio=${ratio.toFixed(4)}`).toBeGreaterThan(0.8);
        expect(ratio, `${model.name}: ratio=${ratio.toFixed(4)}`).toBeLessThan(1.2);
      }
    }, 30000);
  }

  afterAll(() => {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  HékatanLab vs WASM (Eigen C++) — Solver Comparison');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  ${'Model'.padEnd(40)} ${'HékatanLab'.padStart(12)} ${'WASM'.padStart(12)} ${'Ratio'.padStart(8)} Status`);
    console.log('  ' + '-'.repeat(80));
    for (const r of report) {
      const hl = isNaN(r.hekatanlab) ? 'N/A' : r.hekatanlab.toExponential(4);
      const ws = r.wasm.toExponential(4);
      const rt = isNaN(r.ratio) ? 'N/A' : r.ratio.toFixed(4);
      console.log(`  ${r.name.padEnd(40)} ${hl.padStart(12)} ${ws.padStart(12)} ${rt.padStart(8)} ${r.status}`);
    }
    const match = report.filter(r => r.status === '✅ MATCH').length;
    console.log(`\n  RESULT: ${match}/${report.length} models match (ratio 0.8-1.2x)`);
    console.log('═══════════════════════════════════════════════════════════════════\n');
  });
});
