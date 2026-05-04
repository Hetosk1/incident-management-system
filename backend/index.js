const express = require("express");
const cors = require("cors"); 
const app = express(); 
const http = require("http"); 

const {connectPostgres, pool} = require('./database/postgres');
const server = http.createServer(app);

const {initSocket} = require("./socket/socket"); 
const io = initSocket(server); 

connectPostgres();

app.use(cors());

app.get('/health', (_request, _response) => {
    _response.json({ 
        "status": "ok"
    });
});

app.get("/work-items", async (_request, _response) => {
    try { 
        const result = await pool.query(
            "SELECT * FROM work_items ORDER BY created_at DESC"
        );

        console.log(result);

        return _response.json({ 
            success: true, 
            data: result
        })

    } catch(err) { 
        return _response.json({ 
            success: false,
            err: err.message
        });
    }

});

app.get("/work-items/open", async (_request, _response) => {
    try { 
        const result = await pool.query(
            "SELECT * FROM work_items WHERE status = 'OPEN'"
        ); 
        _response.json({ 
            success: true,
            result
        }); 
    } catch(err){ 
        _response.json({ 
            success: false,
            err: err.message 
        }); 
    }
});

app.post("/work-items/:id/close", async (_request, _response) => {
    try { 

        const {id} = _request.params;

        const result = await pool.query(`
            UPDATE work_items
            SET status = 'CLOSED', updated_at = NOW() 
            WHERE id = $1
            RETURNING *`,
            [id]
        ); 

        return _response.json({
            success: true,
            data: result.rows[0]
        }); 
        
    } catch(err) { 
        return _response.json({
            success: false, 
            err: err.message
        })
    }
});


server.listen(3000, () => { 
    console.log("Server running at 3000");
});