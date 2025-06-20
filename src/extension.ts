import * as http from 'http';
import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext) {
	const servers: http.Server[] = [];
	const bgColors = ['red', 'blue', 'green'];

	// 3 "Hello World" servers.
	for (let i = 0; i < 3; i++) {
		const s = http.createServer((req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end(`<html><body bgcolor="${bgColors[i]}"><h1 style="font-family: sans-serif">Server ${i}</h1></body></html>`);
		});
		s.listen();
		servers.push(s);
	}
	const frameUris = await Promise.all(servers.map((s) => vscode.Uri.parse(`http://localhost:${(s.address() as any).port}`)).map(vscode.env.asExternalUri));

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
	servers.push(mainServer);
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
			servers.forEach(server => server.close());
		}
	});
}
