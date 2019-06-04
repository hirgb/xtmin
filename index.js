let intent = 4
let longTextMode = false
let selfCloseTags = [
    'meta',
    'base',
    'br',
    'hr',
    'img',
    'input',
    'col',
    'frame',
    'link',
    'area',
    'param',
    'embed',
    'keygen',
    'source',
]

//confirm line level, and trim the text
function checkLevel(str, intent = 4) {
    //skip the black line
    if (!str.trim()) {
        return {
            success: false
        }
    }
    let match = str.match(/^ +/)
    let level = 0
    if (match) {
        level = match[0].length / intent
    }
    return {
        success: true,
        level,
        trimString: str.trim()
    }
}

/**
 * split line into many parts which include tag,class,id,attrbute, etc.
 * @param  {string} line description
 * @return {array}       description
 */
function splitLine(line) {
    let parts
    let matchDoubleQuote = line.match(/".*?"/g)
    // let matchBackQuote = line.match(/`.*?`/g)
    if (matchDoubleQuote) {
        //search all the ""
        matchDoubleQuote.forEach(i => {
            line = line.replace(i, 'URI:' + encodeURI(i))
        })
        let temp = line.split(' ')
        parts = temp.filter(i => !!i).map(i => {
            if (i.indexOf('URI:') > -1) {
                let t = i.slice(i.indexOf('URI:')).slice(4)
                t = decodeURI(t)
                return i.replace(/URI:.*/, t)
            } else {
                return i
            }
        })
    } else {
        parts = line.split(' ')
    }
    return parts
}

/**
 * generate ast node records line parts.
 * @param  {array} parts the parts of line.
 * @return {object}      An ast node object.
 */
function genAstNode(parts) {
    let node = Object.assign(Object.create(null), {
        tag: '',
        id: '',
        classList: [],
        attrList: [],
        content: '',
        children: [],
    })

    if (Array.isArray(parts)) {
        parts.forEach(i => {
            if (i.startsWith('#')) {
                node.id = i.slice(1)
            } else if (i.startsWith('.')) {
                node.classList.push(i.slice(1))
            } else if (i.indexOf('=') > 0 && i.indexOf('=') < i.length - 1) {
                let a = i.indexOf('=')
                node.attrList.push({
                    name: i.slice(0, a),
                    value: i.slice(a + 1)
                })
            } else if (/^".+"$/.test(i) || /^`.+`$/.test(i)) {
                node.content = i.slice(1, -1)
            } else {
                node.tag = i
            }
        })
    }
    return node
}

//generate ast tree by recursion.
function genAstTree(levelTree) {
    let parts = splitLine(levelTree.text)
    let ast = genAstNode(parts)
    if (levelTree.children.length) {
        levelTree.children.forEach(i => {
            ast.children.push(genAstTree(i))
        })
    }
    return ast
}

//generate html tree string by recursion.
function genHtmlTree(astTree) {
    let startTag = '',
        endTag = '',
        idStr = '',
        classStr = '',
        attrStr = '',
        content = ''

    if (astTree.id) {
        idStr = ` id="${astTree.id}"`
    }
    if (astTree.classList.length) {
        classStr = ` class="${astTree.classList.join(' ')}"`
    }
    if (astTree.attrList.length) {
        let t = astTree.attrList.map(i => {
            let name = i.name,
                value = i.value
            //if attr is ordinary, and value is wraped in '', need to remove the ''
            // if (!name.startsWith('@') && !name.startsWith(':') && /^'.*'$/.test(value)) {
            //     value = `"${value.slice(1, -1)}"`
            // }
            if (!/^".*"$/.test(value)) {
                value = `"${value}"`
            }

            return `${name}=${value}`
        })
        attrStr = ' ' + t.join(' ')
    }
    if (astTree.content) {
        content = astTree.content
    }
    if (astTree.children.length) {
        content = ''
        astTree.children.forEach(i => {
            content += genHtmlTree(i)
        })
    }
    if (astTree.tag) {
        if (selfCloseTags.includes(astTree.tag)) {
            return `<${astTree.tag}${idStr}${classStr}${attrStr} />`
        } else {
            startTag = `<${astTree.tag}${idStr}${classStr}${attrStr}>`
            endTag = `</${astTree.tag}>`
            return `${startTag}${content}${endTag}`
        }
    } else {
        console.warn('There is a node has not tag!')
        return ''
    }
}

/**
 * generate a level line tree with level.
 * @param  {String} str        the source template string.
 * @param  {Number} [intent=4] the intent number
 * @return {Object}            a tree of level and string
 */
function genLevelTree(str, intent = 4) {
    let lines = str.split('\n')
    let tree = Object.create(null)
    let prevNode = null
    let prevLevel = 0
    lines.forEach(i => {
        let {
            success,
            level,
            trimString
        } = checkLevel(i, intent)
        if (success) {
            if (level === 0 && prevNode === null) {
                prevLevel = level
                tree.text = trimString
                tree.children = []
                tree.parent = null
                prevNode = tree
            } else if (prevNode) {
                if (trimString.startsWith('`')) {
                    //support the long text
                    prevNode.text += ' ' + trimString.replace('`', '"')
                    longTextMode = true
                } else if (longTextMode === true) {
                    if (trimString.endsWith('`')) {
                        prevNode.text += trimString.replace('`', '"')
                        longTextMode = false
                    } else {
                        prevNode.text += trimString
                    }
                } else if (prevLevel === level) {
                    if (
                        trimString.startsWith('#') || //#abc
                        trimString.startsWith('.') || //.abc
                        trimString.startsWith('"') || //"abc"
                        /^[A-Za-z0-9-:@\.]+=/.test(trimString) //data=true style="width:12px"
                    ) {
                        //support the return inline.
                        prevNode.text += ' ' + trimString
                    } else if (prevNode.parent && prevNode.parent.children) {
                        let currNode = {
                            text: trimString,
                            children: [],
                            parent: prevNode.parent,
                        }
                        prevNode.parent.children.push(currNode)
                        prevNode = currNode
                        prevLevel = level
                    }
                } else if (level - prevLevel == 1) {
                    let currNode = {
                        text: trimString,
                        children: [],
                        parent: prevNode,
                    }
                    prevNode.children.push(currNode)
                    prevNode = currNode
                    prevLevel = level
                } else if (prevLevel > level) {
                    let diff = prevLevel - level
                    let parent = prevNode.parent
                    for (let i = 0; i < diff; i++) {
                        parent = parent.parent
                    }
                    let currNode = {
                        text: trimString,
                        children: [],
                        parent,
                    }
                    parent.children.push(currNode)
                    prevNode = currNode
                    prevLevel = level
                }
            }
        }
    })
    return tree
}

module.exports = function compiler(str) {
    let levelTree = genLevelTree(str, intent)
    let astTree = genAstTree(levelTree)
    let html = genHtmlTree(astTree)
    return html
}
