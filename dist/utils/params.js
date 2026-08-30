"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseParamId = parseParamId;
/** Express params.id (string | string[]) → string | undefined */
function parseParamId(req, key = 'id') {
    const raw = req.params[key];
    const id = Array.isArray(raw) ? raw[0] : raw;
    return id || undefined;
}
