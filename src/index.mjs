// Entrypoint de la Action, y nada más.
//
// Antes esto vivía al final de main.mjs detrás de un `if
// (process.env.GITHUB_ACTIONS)`. Ese guard es una trampa: la variable también
// está puesta cuando los tests corren DENTRO de Actions, así que importar el
// módulo desde un test disparaba la Action entera y fallaba pidiendo inputs.
// Un archivo que exporta y un archivo que ejecuta no necesitan adivinar el
// contexto.
import { main } from "./main.mjs";

await main();
