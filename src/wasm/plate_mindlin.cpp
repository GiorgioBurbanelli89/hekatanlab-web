/**
 * Mindlin-Reissner Q4 Plate Element — C++ / Emscripten WASM
 * Converted from Owen & Hinton "Finite Elements in Plasticity" (1980)
 *
 * Functions:
 *   k_plate_q4_wasm     — Selective integration (2×2 bending + 1×1 shear)
 *   k_plate_mitc4_wasm  — MITC4 (Bathe & Dvorkin 1986)
 *   solve_plate_ssss     — Full plate solver (assembly + solve)
 *
 * Build: emcc plate_mindlin.cpp -O2 -s EXPORTED_FUNCTIONS=... -o plate_mindlin.js
 */

#include <cmath>
#include <cstring>
#include <vector>
#include <cstdio>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

// ═══════════════════════════════════════════════════════════════
// Shape functions and Jacobian for Q4 element
// ═══════════════════════════════════════════════════════════════

struct EvalResult {
    double N[4];
    double dNdx[4], dNdy[4];
    double J[2][2];
    double detJ;
};

static EvalResult evalPoint(double xi, double eta, const double coords[4][2]) {
    EvalResult r;
    r.N[0] = (1-xi)*(1-eta)/4; r.N[1] = (1+xi)*(1-eta)/4;
    r.N[2] = (1+xi)*(1+eta)/4; r.N[3] = (1-xi)*(1+eta)/4;

    double dxi[4] = {-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4};
    double det[4] = {-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4};

    r.J[0][0]=0; r.J[0][1]=0; r.J[1][0]=0; r.J[1][1]=0;
    for(int i=0;i<4;i++) {
        r.J[0][0]+=dxi[i]*coords[i][0]; r.J[0][1]+=dxi[i]*coords[i][1];
        r.J[1][0]+=det[i]*coords[i][0]; r.J[1][1]+=det[i]*coords[i][1];
    }
    r.detJ = r.J[0][0]*r.J[1][1] - r.J[0][1]*r.J[1][0];
    double invD = 1.0/r.detJ;
    for(int i=0;i<4;i++) {
        r.dNdx[i] = ( r.J[1][1]*dxi[i] - r.J[0][1]*det[i]) * invD;
        r.dNdy[i] = (-r.J[1][0]*dxi[i] + r.J[0][0]*det[i]) * invD;
    }
    return r;
}

// ═══════════════════════════════════════════════════════════════
// k_plate_q4 — Selective integration (Owen & Hinton formulation)
// ═══════════════════════════════════════════════════════════════

EXPORT void k_plate_q4_wasm(
    double E, double nu, double t, double kappa,
    const double* coords_flat,  // 4×2 = 8 doubles
    double* K_out               // 12×12 = 144 doubles
) {
    double coords[4][2];
    for(int i=0;i<4;i++) { coords[i][0]=coords_flat[2*i]; coords[i][1]=coords_flat[2*i+1]; }

    double K[12][12] = {};

    // Material matrices (Owen §6.4.10 MODPB)
    double Dc = E*t*t*t/(12*(1-nu*nu));
    double Db[3][3] = {{Dc, Dc*nu, 0}, {Dc*nu, Dc, 0}, {0, 0, Dc*(1-nu)/2}};
    double Sc = kappa*E*t/(2*(1+nu));
    double Ds[2][2] = {{Sc, 0}, {0, Sc}};

    // Bending 2×2 Gauss
    double g = 1.0/sqrt(3.0);
    double gpts[4][2] = {{-g,-g},{g,-g},{g,g},{-g,g}};
    for(int gp=0; gp<4; gp++) {
        auto ev = evalPoint(gpts[gp][0], gpts[gp][1], coords);
        double Bb[3][12] = {};
        for(int i=0;i<4;i++) {
            Bb[0][3*i+2]=ev.dNdx[i];         // kx = d(thy)/dx
            Bb[1][3*i+1]=-ev.dNdy[i];        // ky = -d(thx)/dy
            Bb[2][3*i+1]=-ev.dNdx[i];        // kxy
            Bb[2][3*i+2]=ev.dNdy[i];
        }
        double f = fabs(ev.detJ);
        for(int i=0;i<12;i++) for(int j=0;j<12;j++) {
            double s=0;
            for(int p=0;p<3;p++) for(int q=0;q<3;q++) s+=Bb[p][i]*Db[p][q]*Bb[q][j];
            K[i][j]+=f*s;
        }
    }

    // Shear 1×1 center
    {
        auto ev = evalPoint(0, 0, coords);
        double Bs[2][12] = {};
        for(int i=0;i<4;i++) {
            Bs[0][3*i]=ev.dNdx[i]; Bs[0][3*i+2]=-ev.N[i];
            Bs[1][3*i]=ev.dNdy[i]; Bs[1][3*i+1]=ev.N[i];
        }
        double f = fabs(ev.detJ)*4;
        for(int i=0;i<12;i++) for(int j=0;j<12;j++) {
            double s=0;
            for(int p=0;p<2;p++) for(int q=0;q<2;q++) s+=Bs[p][i]*Ds[p][q]*Bs[q][j];
            K[i][j]+=f*s;
        }
    }

    memcpy(K_out, K, 144*sizeof(double));
}

// ═══════════════════════════════════════════════════════════════
// k_plate_mitc4 — MITC4 (Bathe & Dvorkin 1986)
// Full 2×2 Gauss with assumed strain shear
// ═══════════════════════════════════════════════════════════════

static void covShearRow(double xi, double eta, int alpha,
    const double coords[4][2], double row[12])
{
    auto ev = evalPoint(xi, eta, coords);
    double Ja1 = ev.J[alpha][0], Ja2 = ev.J[alpha][1];
    for(int i=0;i<4;i++) {
        row[3*i]   = Ja1*ev.dNdx[i] + Ja2*ev.dNdy[i]; // w
        row[3*i+1] = Ja2*ev.N[i];                       // thx
        row[3*i+2] = -Ja1*ev.N[i];                      // thy
    }
}

EXPORT void k_plate_mitc4_wasm(
    double E, double nu, double t, double kappa,
    const double* coords_flat, double* K_out)
{
    double coords[4][2];
    for(int i=0;i<4;i++) { coords[i][0]=coords_flat[2*i]; coords[i][1]=coords_flat[2*i+1]; }

    double K[12][12] = {};
    double Dc = E*t*t*t/(12*(1-nu*nu));
    double Db[3][3] = {{Dc, Dc*nu, 0}, {Dc*nu, Dc, 0}, {0, 0, Dc*(1-nu)/2}};
    double Sc = kappa*E*t/(2*(1+nu));
    double Ds[2][2] = {{Sc, 0}, {0, Sc}};

    // MITC4 tying points
    double e13_A[12], e13_C[12], e23_B[12], e23_D[12];
    covShearRow( 0,-1, 0, coords, e13_A);
    covShearRow( 0,+1, 0, coords, e13_C);
    covShearRow(-1, 0, 1, coords, e23_B);
    covShearRow(+1, 0, 1, coords, e23_D);

    double g = 1.0/sqrt(3.0);
    double gpts[4][2] = {{-g,-g},{g,-g},{g,g},{-g,g}};

    for(int gp=0; gp<4; gp++) {
        double xi = gpts[gp][0], eta = gpts[gp][1];
        auto ev = evalPoint(xi, eta, coords);
        double wt = fabs(ev.detJ);

        // Bending (standard)
        double Bb[3][12] = {};
        for(int i=0;i<4;i++) {
            Bb[0][3*i+2]=ev.dNdx[i]; Bb[1][3*i+1]=-ev.dNdy[i];
            Bb[2][3*i+1]=-ev.dNdx[i]; Bb[2][3*i+2]=ev.dNdy[i];
        }
        for(int i=0;i<12;i++) for(int j=0;j<12;j++) {
            double s=0;
            for(int p=0;p<3;p++) for(int q=0;q<3;q++) s+=Bb[p][i]*Db[p][q]*Bb[q][j];
            K[i][j]+=wt*s;
        }

        // MITC4 assumed shear
        double ae13[12], ae23[12];
        for(int j=0;j<12;j++) {
            ae13[j] = 0.5*(1-eta)*e13_A[j] + 0.5*(1+eta)*e13_C[j];
            ae23[j] = 0.5*(1-xi)*e23_B[j]  + 0.5*(1+xi)*e23_D[j];
        }
        double invD = 1.0/ev.detJ;
        double BsM[2][12];
        for(int j=0;j<12;j++) {
            BsM[0][j] = invD*( ev.J[1][1]*ae13[j] - ev.J[0][1]*ae23[j]);
            BsM[1][j] = invD*(-ev.J[1][0]*ae13[j] + ev.J[0][0]*ae23[j]);
        }
        for(int i=0;i<12;i++) for(int j=0;j<12;j++) {
            double s=0;
            for(int p=0;p<2;p++) for(int q=0;q<2;q++) s+=BsM[p][i]*Ds[p][q]*BsM[q][j];
            K[i][j]+=wt*s;
        }
    }

    memcpy(K_out, K, 144*sizeof(double));
}

// ═══════════════════════════════════════════════════════════════
// Plate bending D-matrices (Owen §6.4.10 MODPB)
// ═══════════════════════════════════════════════════════════════

EXPORT void modpb(double E, double nu, double t, double kappa,
    double* Dflex_out, double* Dsher_out)
{
    double Dc = E*t*t*t/(12*(1-nu*nu));
    // Dflex 3×3
    double Df[9] = {Dc, Dc*nu, 0, Dc*nu, Dc, 0, 0, 0, Dc*(1-nu)/2};
    memcpy(Dflex_out, Df, 9*sizeof(double));
    // Dsher 2×2 (Owen: E*t/(2.4+2.4*nu) = kappa*G*t)
    double Sc = kappa*E*t/(2*(1+nu));
    double Ds[4] = {Sc, 0, 0, Sc};
    memcpy(Dsher_out, Ds, 4*sizeof(double));
}

#ifndef __EMSCRIPTEN__
// Test main for native compilation
int main() {
    double coords[8] = {0,0, 1,0, 1,1, 0,1};
    double K[144];

    k_plate_q4_wasm(10920, 0.3, 0.1, 5.0/6.0, coords, K);
    printf("K_q4[0][0] = %.6f\n", K[0]);

    k_plate_mitc4_wasm(10920, 0.3, 0.1, 5.0/6.0, coords, K);
    printf("K_mitc4[0][0] = %.6f\n", K[0]);

    return 0;
}
#endif
