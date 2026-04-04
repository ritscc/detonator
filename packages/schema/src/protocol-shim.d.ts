declare module "@detonator/protocol" {
	export enum CellType {
		Safe = 0,
		SafeMine = 1,
		DangerousMine = 2,
		Wasteland = 3,
		Hole = 4,
	}

	export enum GamePhase {
		Playing = 0,
		FloorClearTransition = 1,
		Rest = 2,
		GameOver = 3,
	}

	export enum PlayerLifeState {
		Alive = 0,
		Ghost = 1,
		Disconnected = 2,
	}

	export enum Facing8 {
		N = 0,
		NE = 1,
		E = 2,
		SE = 3,
		S = 4,
		SW = 5,
		W = 6,
		NW = 7,
	}

	export enum ItemType {
		RelayPoint = "relay_point",
		Dash = "dash",
		ForceIgnition = "force_ignition",
		MineRemoverCheap = "mine_remover_cheap",
		MineRemoverNormal = "mine_remover_normal",
		MineRemoverHigh = "mine_remover_high",
		CatsEye = "cats_eye",
		Evacuation = "evacuation",
		TakeABreath = "take_a_breath",
		ShortBreak = "short_break",
		Bridge = "bridge",
		DisposableLife = "disposable_life",
		NineLives = "nine_lives",
		Purify = "purify",
	}
}
