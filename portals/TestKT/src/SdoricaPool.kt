class  SdoricaPool : Pool{
    override val N_Set: Set<String>
        get() = setOf("罗杰","人鱼")

    override val R_Set: Set<String>
        get() = setOf("纳杰尔","璃")

    override val SR_Set: Set<String>
        get() = setOf("公主")

    override val SSR_Set: Set<String>
        get() = setOf()

    override val EXTRA_Set: Set<String>
        get() = setOf()

    override val probability: List<Double>
        get() = listOf(0.6,0.3,0.1)

    operator fun get(position : Int) : Set<String> =
            when(position){
                0 -> N_Set
                1 -> R_Set
                2 -> SR_Set
                else -> N_Set
            }
}