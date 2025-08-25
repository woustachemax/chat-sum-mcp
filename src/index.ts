import express from 'express'
import slackRouter from './slackRouter/indext'

const app = express()
app.use(express.json())

app.use('/slack', slackRouter)

const PORT = 3000;
app.listen(PORT, ()=>{
    console.log(`App is up and running on port ${PORT}`)
})