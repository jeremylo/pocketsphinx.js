export default class CallbackManager {
	constructor() {
		this.currentId = 0;
		this.callbackPool = {};
	}

	add(callback) {
		let id = this.currentId;
		this.callbackPool[this.currentId++] = callback;
		return id;
	}

	get(id) {
		if (id in this.callbackPool) {
			let callback = this.callbackPool[id];
			delete this.callbackPool[id];
			return callback;
		}
	}
};
