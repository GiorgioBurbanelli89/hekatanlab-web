/*
 * Triangle WASM wrapper for HékatanLab
 * Uses Shewchuk's Triangle v1.6 (single-file, TRILIBRARY mode)
 */
#define TRILIBRARY
#define ANSI_DECLARATORS
#define NO_TIMER
#define REAL double
#define VOID int

#include "triangle.h"

#include <emscripten/emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static double *out_points = NULL;
static int *out_triangles = NULL;
static int *out_markers = NULL;
static int out_npoints = 0;
static int out_ntriangles = 0;

EMSCRIPTEN_KEEPALIVE
int triangulate_mesh(
    double *points, int npoints,
    int *segments, int nsegments,
    double max_area, double min_angle
) {
    struct triangulateio in, out, vorout;
    memset(&in, 0, sizeof(in));
    memset(&out, 0, sizeof(out));
    memset(&vorout, 0, sizeof(vorout));

    in.numberofpoints = npoints;
    in.pointlist = points;
    in.numberofsegments = nsegments;
    in.segmentlist = segments;

    char switches[64];
    snprintf(switches, sizeof(switches), "pzq%.0fa%.8fQO", min_angle, max_area);

    triangulate(switches, &in, &out, &vorout);

    /* Free previous */
    if (out_points) free(out_points);
    if (out_triangles) free(out_triangles);
    if (out_markers) free(out_markers);

    out_npoints = out.numberofpoints;
    out_ntriangles = out.numberoftriangles;
    out_points = out.pointlist;
    out_triangles = out.trianglelist;
    out_markers = out.pointmarkerlist;

    return out_ntriangles;
}

EMSCRIPTEN_KEEPALIVE int get_npoints(void) { return out_npoints; }
EMSCRIPTEN_KEEPALIVE int get_ntriangles(void) { return out_ntriangles; }
EMSCRIPTEN_KEEPALIVE double* get_points(void) { return out_points; }
EMSCRIPTEN_KEEPALIVE int* get_triangles(void) { return out_triangles; }
EMSCRIPTEN_KEEPALIVE int* get_pointmarkers(void) { return out_markers; }

EMSCRIPTEN_KEEPALIVE void free_output(void) {
    if (out_points) { trifree((VOID*)out_points); out_points = NULL; }
    if (out_triangles) { trifree((VOID*)out_triangles); out_triangles = NULL; }
    if (out_markers) { trifree((VOID*)out_markers); out_markers = NULL; }
    out_npoints = 0; out_ntriangles = 0;
}
