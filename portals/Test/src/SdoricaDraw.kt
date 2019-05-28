class SdoricaDraw : Draw{
    override val pool: Pool
        get() = SdoricaPool()

    override fun singleDraw() {
        val seed = Math.random()
        var i = 0;
        var final : Int = 0
        val finalPool : Int

        if(seed in 0.0..pool.probability[0]){
            final = (Math.random() * pool.N_Set.count()) as Int
            finalPool = 0
        } else if(seed in pool.probability[0]..pool.probability[0] + pool.probability[1]){
            final = (Math.random() * pool.R_Set.count()) as Int
            finalPool = 1
        } else {
            final = (Math.random() * pool.R_Set.count()) as Int
            finalPool = 2
        }

        val nextPool =
                when(finalPool){
                    0 -> pool.N_Set
                    1 -> pool.R_Set
                    2 -> pool.SR_Set
                    else -> pool.N_Set
                }
        for (e in nextPool){
            
        }
    }

    override fun multieDraw() {

    }
}