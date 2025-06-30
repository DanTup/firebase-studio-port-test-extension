import * as http from 'http';
import * as vscode from 'vscode';
import * as WebSocket from 'ws';

export async function setUpServers(context: vscode.ExtensionContext) {
	const htmlServers: http.Server[] = [];
	const wsServers: Array<{ close: () => void }> = [];
	const bgColors = ['red', 'blue', 'green'];

	// 3 "Hello World" servers which consist ot a HTTP server that serves a simple HTML page
	// and a WebSocket server that sends a "Hello World" message on connection.
	for (let i = 0; i < 3; i++) {
		// Create the WebSocket server and a HTTP server to support it.
		const wsHttpServer = http.createServer();
		const wsServer = new WebSocket.Server({ server: wsHttpServer });
		wsServer.on('connection', (socket: WebSocket.WebSocket) => {
			socket.send('Hello World');
		});
		wsHttpServer.listen();
		wsServers.push(wsHttpServer);
		wsServers.push(wsServer);

		const htmlServer = http.createServer((req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end(`<html><body bgcolor="${bgColors[i]}"><h1 style="font-family: sans-serif">Server ${i}</h1></body></html>`);
		});
		htmlServer.listen();
		htmlServers.push(htmlServer);
	}

	const frameUris = await Promise.all(htmlServers.map((s) => vscode.Uri.parse(`http://localhost:${(s.address() as any).port}`)).map(vscode.env.asExternalUri));

	// Main server that just shows iframes for the others.
	const mainServer = http.createServer((req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end(`
				<!DOCTYPE html>
				<html><body bgcolor="yellow">
					<h1 style="font-family: sans-serif">Main Server</h1>
					${frameUris.map((uri) => `<iframe src="${uri}" width="500" height="100"></iframe><br/>`).join("\n")}
				</body></html>
			`);
	});
	mainServer.listen();
	htmlServers.push(mainServer);
	const mainUri = await vscode.env.asExternalUri(vscode.Uri.parse(`http://localhost:${(mainServer.address() as any).port}`));

	// Now open an embedded editor webview that points to the main server.
	const panel = vscode.window.createWebviewPanel(
		'helloWorld',
		'Hello World',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			localResourceRoots: []
		}
	);

	panel.webview.html = `
		<html>
		<body>
		<h1 style="font-family: sans-serif">Panel HTML</h1>
		<iframe id="x" src="${mainUri}" width="600" height="500"></iframe>
		</body>
		</html>
	`;

	context.subscriptions.push({
		dispose: () => {
			htmlServers.forEach(server => server.close());
			wsServers.forEach(ws => ws.close());
		}
	});
}

export async function activate(context: vscode.ExtensionContext) {
	await new Promise((resolve) => setTimeout(resolve, 1000));
	await setUpServers(context);
}
