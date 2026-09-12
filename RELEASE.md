# Release

Nemo Calendar는 **앱 단위 단일 SemVer**를 씁니다.
이 레포(`nemocalendar-api`)의 `package.json` `"version"`은 frontend와 **항상 동일**해야 합니다.

## Canonical 문서 (frontend 레포)

| 문서 | 링크 |
| --- | --- |
| Changelog | [CHANGELOG.md](https://github.com/sonhyo0518/nemocalendar-frontend/blob/main/CHANGELOG.md) |
| Versioning · 태그 규칙 | [VERSIONING.md](https://github.com/sonhyo0518/nemocalendar-frontend/blob/main/VERSIONING.md) |
| 사용자용 릴리즈 노트 | 사이트 [`/changelog`](https://nemocalendar.vercel.app/changelog) |

로컬 워크스페이스(`nemoCalendar2/`)에서는 `../frontend/CHANGELOG.md`, `../frontend/VERSIONING.md`를 편집·참고하세요.

## 이 레포에서 할 일 (요약)

1. frontend와 같은 `X.Y.Z`로 `package.json` / `package-lock.json` 루트 version을 맞춘다.
2. `chore(release): vX.Y.Z` 커밋 후 annotated tag `vX.Y.Z` (`-m "Release vX.Y.Z"`)를 단다.
3. `git push origin HEAD` 및 `git push origin vX.Y.Z`.

상세 체크리스트는 frontend [VERSIONING.md](https://github.com/sonhyo0518/nemocalendar-frontend/blob/main/VERSIONING.md)를 따릅니다.
