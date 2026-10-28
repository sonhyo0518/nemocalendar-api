# Release

Nemo Calendar는 **앱 단위 단일 SemVer**를 씁니다.
이 레포(`nemocalendar-api`)의 `package.json` `"version"`은 frontend와 **항상 동일**해야 합니다.

## Canonical 문서 (frontend 레포)

| 문서 | 링크 |
| --- | --- |
| Changelog | [CHANGELOG.md](https://github.com/sonhyo0518/nemocalendar/blob/main/CHANGELOG.md) |
| Versioning · 태그 규칙 | [VERSIONING.md](https://github.com/sonhyo0518/nemocalendar/blob/main/VERSIONING.md) |
| Deployment | [DEPLOYMENT.md](https://github.com/sonhyo0518/nemocalendar/blob/main/DEPLOYMENT.md) |
| Roadmap | [ROADMAP.md](https://github.com/sonhyo0518/nemocalendar/blob/main/ROADMAP.md) |
| 프로젝트 설명 | [프로젝트 설명.md](https://github.com/sonhyo0518/nemocalendar/blob/main/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%20%EC%84%A4%EB%AA%85.md) |
| 사용자용 릴리즈 노트 | 사이트 [`/changelog`](https://nemocalendar.com/changelog) |

로컬 워크스페이스(`nemoCalendar2/`)에서는 `../frontend/` 아래 동명 파일을 편집·참고하세요.

## 이 레포에서 할 일 (요약)

frontend 릴리즈(CHANGELOG·tag)가 끝난 뒤, **같은 `X.Y.Z`** 로 맞춘다.

1. `package.json` / `package-lock.json` 루트 `"version"`을 frontend와 동일하게 둔다.
2. `chore(release): vX.Y.Z` 커밋 후 annotated tag `vX.Y.Z` (`-m "Release vX.Y.Z"`)를 단다.
3. `git push origin HEAD` 및 `git push origin vX.Y.Z`.

전체 순서·확인 명령은 frontend [VERSIONING.md — 듀얼 레포 릴리즈 절차](https://github.com/sonhyo0518/nemocalendar/blob/main/VERSIONING.md)를 따른다.
