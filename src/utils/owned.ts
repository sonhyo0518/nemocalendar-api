import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { parseParamId } from './params';

type FindOwnedFn<T> = (args: {
  where: { idx: bigint; user_idx: bigint };
}) => Promise<T | null>;

/**
 * params.id 파싱 + 소유 리소스 조회.
 * 실패 시 응답을 보내고 null 반환.
 */
export async function requireOwned<T>(
  req: AuthRequest,
  res: Response,
  findFirst: FindOwnedFn<T>,
): Promise<T | null> {
  const id = parseParamId(req);
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