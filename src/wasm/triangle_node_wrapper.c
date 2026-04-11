/*
 * Triangle WASM wrapper for Node.js CLI
 * Uses triangle_api.h (multi-file refactored version)
 */
#include <emscripten/emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#include "triangle_config.h"
#include "triangle.h"
#include "triangle_api.h"

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
    /* Setup input */
    triangleio in;
    memset(&in, 0, sizeof(in));
    in.numberofpoints = npoints;
    in.pointlist = points;
    in.numberofsegments = nsegments;
    in.segmentlist = segments;

    /* Create context and set options */
    context *ctx = triangle_context_create();

    char options[64];
    snprintf(options, sizeof(options), "pzq%.0fa%.8fQO", min_angle, max_area);
    triangle_context_options(ctx, options);

    /* Triangulate */
    triangle_mesh_create(ctx, &in);

    /* Get output */
    triangleio out;
    memset(&out, 0, sizeof(out));
    triangle_mesh_copy(ctx, &out, 1, 1);

    /* Free previous output */
    if (out_points) free(out_points);
    if (out_triangles) free(out_triangles);
    if (out_markers) free(out_markers);

    out_npoints = out.numberofpoints;
    out_ntriangles = out.numberoftriangles;
    out_points = out.pointlist;
    out_triangles = out.trianglelist;
    out_markers = out.pointmarkerlist;

    triangle_context_destroy(ctx);

    return out_ntriangles;
}

EMSCRIPTEN_KEEPALIVE int get_npoints(void) { return out_npoints; }
EMSCRIPTEN_KEEPALIVE int get_ntriangles(void) { return out_ntriangles; }
EMSCRIPTEN_KEEPALIVE double* get_points(void) { return out_points; }
EMSCRIPTEN_KEEPALIVE int* get_triangles(void) { return out_triangles; }
EMSCRIPTEN_KEEPALIVE int* get_pointmarkers(void) { return out_markers; }

EMSCRIPTEN_KEEPALIVE void free_output(void) {
    if (out_points) { free(out_points); out_points = NULL; }
    if (out_triangles) { free(out_triangles); out_triangles = NULL; }
    if (out_markers) { free(out_markers); out_markers = NULL; }
    out_npoints = 0; out_ntriangles = 0;
}
