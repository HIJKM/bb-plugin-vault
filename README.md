# Vault

Read-only browser for markdown folders. Opens markdown as rendered text and never writes.

Add vault folders in the plugin settings page, then drag to set tab order.

## 3D 그래프

그래프에서 노트와 위키 링크를 입체적으로 탐색할 수 있다.

- 드래그로 회전하고 노트를 클릭하거나 탭하면 문서를 연다.
- 휠·핀치 또는 `+`/`−` 버튼으로 확대·축소한다. `Shift`+드래그 또는 두 손가락 이동으로 화면을 옮긴다.
- `초기화`로 처음 시점으로 돌아간다. 캔버스에 키보드 초점을 두면 방향키로 회전하고 `+`/`−`, `Home`도 사용할 수 있다.

추가 3D 라이브러리 없이 Canvas에 3D 좌표를 투영한다. 배치가 안정되거나 화면이 숨겨지면 반복 렌더링을 멈춘다. 모바일에서는 해상도·프레임 수·이름 표시량을 줄이고, 느린 프레임이 반복되면 해상도를 더 낮춘다. 연결이 매우 많으면 일부 선만 표시하되 현재 문서와 마우스를 올린 노트의 연결은 모두 표시한다.
