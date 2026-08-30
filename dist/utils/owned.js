"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOwned = requireOwned;
const params_1 = require("./params");
/**
 * params.id 파싱 + 소유 리소스 조회.
 * 실패 시 응답을 보내고 null 반환.
 */
async function requireOwned(req, res, findFirst) {
    const id = (0, params_1.parseParamId)(req);
    if (!id) {
        res.status(400).json({ error: 'id is required' });
        return null;
    }
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    const existing = await findFirst({
        where: { idx: BigInt(id), user_idx: BigInt(req.userIdx) },
    });
    if (!existing) {
        res.status(404).json({ error: 'Not found' });
        return null;
    }
    return existing;
}
